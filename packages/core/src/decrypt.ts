import { base64urlToBuffer, bufferToBase64url, concatBuffers } from "./utils";

export class Decryptor {
  private constructor(
    private keyPair: CryptoKeyPair,
    private publicKeyRaw: ArrayBuffer,
    private authSecret: ArrayBuffer,
    private jwk: JsonWebKey,
  ) {}

  static async create(jwk?: JsonWebKey, authBase64url?: string): Promise<Decryptor> {
    let keyPair: CryptoKeyPair;
    let savedJwk: JsonWebKey;

    if (jwk) {
      const privateKey = await crypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveBits"],
      );
      const pubJwk = { ...jwk, d: undefined, key_ops: [] };
      delete pubJwk.d;
      const publicKey = await crypto.subtle.importKey(
        "jwk",
        pubJwk,
        { name: "ECDH", namedCurve: "P-256" },
        true,
        [],
      );
      keyPair = { privateKey, publicKey };
      savedJwk = jwk;
    } else {
      keyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
        "deriveBits",
      ]);
      savedJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
    }

    const publicKeyRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
    const authSecret = authBase64url
      ? base64urlToBuffer(authBase64url)
      : crypto.getRandomValues(new Uint8Array(16)).buffer;

    return new Decryptor(keyPair, publicKeyRaw, authSecret, savedJwk);
  }

  getJwk(): JsonWebKey {
    return this.jwk;
  }

  getAuthBase64url(): string {
    return bufferToBase64url(this.authSecret);
  }

  getPublicKeyBase64url(): string {
    return bufferToBase64url(this.publicKeyRaw);
  }

  async decrypt(
    cryptoKeyHeader: string,
    encryptionHeader: string,
    payload: ArrayBuffer,
  ): Promise<string> {
    const cryptoKeyParams = parseHeader(cryptoKeyHeader);
    const encryptionParams = parseHeader(encryptionHeader);

    const remotePubKeyBytes = base64urlToBuffer(cryptoKeyParams.dh);
    const salt = base64urlToBuffer(encryptionParams.salt);
    const rs = encryptionParams.rs ? parseInt(encryptionParams.rs) : 0;

    // Import remote public key
    const remotePubKey = await crypto.subtle.importKey(
      "raw",
      remotePubKeyBytes,
      { name: "ECDH", namedCurve: "P-256" },
      true,
      [],
    );

    // ECDH shared secret
    const sharedSecret = new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: "ECDH", public: remotePubKey },
        this.keyPair.privateKey,
        256,
      ),
    );

    // Derive IKM: HKDF(salt=authSecret, ikm=sharedSecret, info="Content-Encoding: auth\0", 32)
    const authInfo = new TextEncoder().encode("Content-Encoding: auth\0");
    const ikm = await hkdf(new Uint8Array(this.authSecret), sharedSecret, authInfo, 32);

    // Context: "P-256\0" || len(localPub) || localPub || len(remotePub) || remotePub
    const context = concatBuffers(
      new TextEncoder().encode("P-256\0").buffer,
      new Uint8Array([0, 65]).buffer,
      this.publicKeyRaw,
      new Uint8Array([0, 65]).buffer,
      remotePubKeyBytes,
    );

    // Derive CEK (16 bytes)
    const cekInfo = concatBuffers(
      new TextEncoder().encode("Content-Encoding: aesgcm\0").buffer,
      context,
    );
    const cek = await hkdf(new Uint8Array(salt), ikm, new Uint8Array(cekInfo), 16);

    // Derive nonce (12 bytes)
    const nonceInfo = concatBuffers(
      new TextEncoder().encode("Content-Encoding: nonce\0").buffer,
      context,
    );
    const nonce = await hkdf(new Uint8Array(salt), ikm, new Uint8Array(nonceInfo), 12);

    // AES-128-GCM decryption
    const cekKey = await crypto.subtle.importKey("raw", cek as AB, "AES-GCM", false, ["decrypt"]);

    let decrypted: ArrayBuffer;
    if (rs >= 18) {
      const chunks = splitPayload(payload, rs);
      const parts: ArrayBuffer[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunkNonce = adjustNonce(nonce, i);
        const part = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: chunkNonce as AB },
          cekKey,
          chunks[i],
        );
        parts.push(part);
      }
      decrypted = concatBuffers(...parts);
    } else {
      decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: nonce as AB },
        cekKey,
        payload,
      );
    }

    // Remove aesgcm padding: first 2 bytes = padding length
    const view = new DataView(decrypted);
    const paddingLen = view.getUint16(0);
    const plaintext = decrypted.slice(2 + paddingLen);

    return new TextDecoder().decode(plaintext);
  }
}

function parseHeader(header: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      result[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
    }
  }
  return result;
}

// Helper to satisfy TS 5.9 BufferSource constraint (Uint8Array<ArrayBufferLike> → Uint8Array<ArrayBuffer>)
type AB = Uint8Array<ArrayBuffer>;

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as AB,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, data as AB));
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  // Extract
  const prk = await hmacSha256(salt, ikm);
  // Expand (single iteration, sufficient for <= 32 bytes)
  const infoWithCounter = new Uint8Array(info.length + 1);
  infoWithCounter.set(info);
  infoWithCounter[info.length] = 1;
  const expanded = await hmacSha256(prk, infoWithCounter);
  return expanded.slice(0, length);
}

function splitPayload(payload: ArrayBuffer, rs: number): ArrayBuffer[] {
  const bytes = new Uint8Array(payload);
  const chunks: ArrayBuffer[] = [];
  for (let i = 0; i < bytes.length; i += rs) {
    chunks.push(bytes.slice(i, Math.min(i + rs, bytes.length)).buffer);
  }
  return chunks;
}

function adjustNonce(nonce: Uint8Array, offset: number): Uint8Array {
  if (offset === 0) return nonce;
  const adjusted = new Uint8Array(nonce);
  for (let i = 11; i >= 6; i--) {
    adjusted[i] ^= (offset >>> ((11 - i) * 8)) & 0xff;
  }
  return adjusted;
}
