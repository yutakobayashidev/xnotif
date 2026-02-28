import { base64urlToBuffer, bufferToBase64url, concatBuffers } from "./utils";

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		key as Uint8Array<ArrayBuffer>,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, data as Uint8Array<ArrayBuffer>));
}

async function hkdf(
	salt: Uint8Array,
	ikm: Uint8Array,
	info: Uint8Array,
	length: number,
): Promise<Uint8Array> {
	const prk = await hmacSha256(salt, ikm);
	const infoWithCounter = new Uint8Array(info.length + 1);
	infoWithCounter.set(info);
	infoWithCounter[info.length] = 1;
	const expanded = await hmacSha256(prk, infoWithCounter);
	return expanded.slice(0, length);
}

function adjustNonce(nonce: Uint8Array, offset: number): Uint8Array {
	if (offset === 0) return nonce;
	const adjusted = new Uint8Array(nonce);
	for (let i = 11; i >= 6; i--) {
		adjusted[i] ^= (offset >>> ((11 - i) * 8)) & 0xff;
	}
	return adjusted;
}

interface EncryptResult {
	cryptoKeyHeader: string;
	encryptionHeader: string;
	ciphertext: ArrayBuffer;
}

async function deriveKeys(
	decryptorPublicKeyBase64url: string,
	authBase64url: string,
): Promise<{
	serverPubRaw: ArrayBuffer;
	cek: Uint8Array;
	nonce: Uint8Array;
	salt: Uint8Array;
}> {
	const serverKeyPair = await crypto.subtle.generateKey(
		{ name: "ECDH", namedCurve: "P-256" },
		true,
		["deriveBits"],
	);
	const serverPubRaw = await crypto.subtle.exportKey("raw", serverKeyPair.publicKey);

	const localPubBytes = base64urlToBuffer(decryptorPublicKeyBase64url);
	const localPubKey = await crypto.subtle.importKey(
		"raw",
		localPubBytes,
		{ name: "ECDH", namedCurve: "P-256" },
		true,
		[],
	);

	const sharedSecret = new Uint8Array(
		await crypto.subtle.deriveBits({ name: "ECDH", public: localPubKey }, serverKeyPair.privateKey, 256),
	);

	const authSecret = new Uint8Array(base64urlToBuffer(authBase64url));
	const authInfo = new TextEncoder().encode("Content-Encoding: auth\0");
	const ikm = await hkdf(authSecret, sharedSecret, authInfo, 32);

	const salt = crypto.getRandomValues(new Uint8Array(16));

	const context = concatBuffers(
		new TextEncoder().encode("P-256\0").buffer,
		new Uint8Array([0, 65]).buffer,
		localPubBytes,
		new Uint8Array([0, 65]).buffer,
		serverPubRaw,
	);

	const cekInfo = concatBuffers(new TextEncoder().encode("Content-Encoding: aesgcm\0").buffer, context);
	const cek = await hkdf(salt, ikm, new Uint8Array(cekInfo), 16);

	const nonceInfo = concatBuffers(new TextEncoder().encode("Content-Encoding: nonce\0").buffer, context);
	const nonce = await hkdf(salt, ikm, new Uint8Array(nonceInfo), 12);

	return { serverPubRaw, cek, nonce, salt };
}

export async function webPushEncrypt(
	plaintext: string,
	decryptorPublicKeyBase64url: string,
	authBase64url: string,
): Promise<EncryptResult> {
	const { serverPubRaw, cek, nonce, salt } = await deriveKeys(
		decryptorPublicKeyBase64url,
		authBase64url,
	);

	const plaintextBytes = new TextEncoder().encode(plaintext);
	const padded = new Uint8Array(2 + plaintextBytes.length);
	padded[0] = 0;
	padded[1] = 0;
	padded.set(plaintextBytes, 2);

	const cekKey = await crypto.subtle.importKey("raw", cek as Uint8Array<ArrayBuffer>, "AES-GCM", false, [
		"encrypt",
	]);
	const ciphertext = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv: nonce as Uint8Array<ArrayBuffer> },
		cekKey,
		padded as Uint8Array<ArrayBuffer>,
	);

	return {
		cryptoKeyHeader: `dh=${bufferToBase64url(serverPubRaw)}`,
		encryptionHeader: `salt=${bufferToBase64url(salt.buffer)}`,
		ciphertext,
	};
}

export async function webPushEncryptChunked(
	plaintext: string,
	decryptorPublicKeyBase64url: string,
	authBase64url: string,
	rs: number,
): Promise<EncryptResult> {
	const { serverPubRaw, cek, nonce, salt } = await deriveKeys(
		decryptorPublicKeyBase64url,
		authBase64url,
	);

	const plaintextBytes = new TextEncoder().encode(plaintext);
	const padded = new Uint8Array(2 + plaintextBytes.length);
	padded[0] = 0;
	padded[1] = 0;
	padded.set(plaintextBytes, 2);

	const cekKey = await crypto.subtle.importKey("raw", cek as Uint8Array<ArrayBuffer>, "AES-GCM", false, [
		"encrypt",
	]);

	const chunkPlaintextSize = rs - 16; // 16 bytes for GCM tag
	const encryptedChunks: ArrayBuffer[] = [];
	for (let i = 0; i < padded.length; i += chunkPlaintextSize) {
		const chunk = padded.slice(i, Math.min(i + chunkPlaintextSize, padded.length));
		const chunkNonce = adjustNonce(nonce, Math.floor(i / chunkPlaintextSize));
		const encrypted = await crypto.subtle.encrypt(
			{ name: "AES-GCM", iv: chunkNonce as Uint8Array<ArrayBuffer> },
			cekKey,
			chunk as Uint8Array<ArrayBuffer>,
		);
		encryptedChunks.push(encrypted);
	}

	const ciphertext = concatBuffers(...encryptedChunks);

	return {
		cryptoKeyHeader: `dh=${bufferToBase64url(serverPubRaw)}`,
		encryptionHeader: `salt=${bufferToBase64url(salt.buffer)};rs=${rs}`,
		ciphertext,
	};
}
