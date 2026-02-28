import { describe, expect, it } from "vitest";
import { Decryptor } from "./decrypt";
import { base64urlToBuffer } from "./utils";
import { webPushEncrypt, webPushEncryptChunked } from "./test-encrypt";

describe("Decryptor", () => {
  it("create() generates a new Decryptor instance", async () => {
    const decryptor = await Decryptor.create();
    expect(decryptor).toBeInstanceOf(Decryptor);
  });

  it("create() with saved JWK restores the same public key", async () => {
    const original = await Decryptor.create();
    const jwk = original.getJwk();
    const auth = original.getAuthBase64url();

    const restored = await Decryptor.create(jwk, auth);
    expect(restored.getPublicKeyBase64url()).toBe(original.getPublicKeyBase64url());
    expect(restored.getAuthBase64url()).toBe(original.getAuthBase64url());
  });

  it("getJwk() returns a valid EC P-256 JWK", async () => {
    const decryptor = await Decryptor.create();
    const jwk = decryptor.getJwk();

    expect(jwk.crv).toBe("P-256");
    expect(jwk.kty).toBe("EC");
    expect(jwk.x).toBeDefined();
    expect(jwk.y).toBeDefined();
    expect(jwk.d).toBeDefined();
  });

  it("getAuthBase64url() returns a non-empty base64url string", async () => {
    const decryptor = await Decryptor.create();
    const auth = decryptor.getAuthBase64url();

    expect(auth.length).toBeGreaterThan(0);
    expect(auth).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("getPublicKeyBase64url() returns a 65-byte uncompressed P-256 key", async () => {
    const decryptor = await Decryptor.create();
    const pubKeyBytes = new Uint8Array(base64urlToBuffer(decryptor.getPublicKeyBase64url()));

    expect(pubKeyBytes.length).toBe(65);
    expect(pubKeyBytes[0]).toBe(0x04);
  });

  it("full AESGCM encrypt-then-decrypt round-trip", async () => {
    const decryptor = await Decryptor.create();
    const plaintext = "Hello, WebPush AESGCM!";

    const { cryptoKeyHeader, encryptionHeader, ciphertext } = await webPushEncrypt(
      plaintext,
      decryptor.getPublicKeyBase64url(),
      decryptor.getAuthBase64url(),
    );

    const result = await decryptor.decrypt(cryptoKeyHeader, encryptionHeader, ciphertext);
    expect(result).toBe(plaintext);
  });

  it("round-trip works with unicode text", async () => {
    const decryptor = await Decryptor.create();
    const plaintext = "Notification: @user mentioned you \u{1F680}\u{1F30D}";

    const { cryptoKeyHeader, encryptionHeader, ciphertext } = await webPushEncrypt(
      plaintext,
      decryptor.getPublicKeyBase64url(),
      decryptor.getAuthBase64url(),
    );

    expect(await decryptor.decrypt(cryptoKeyHeader, encryptionHeader, ciphertext)).toBe(plaintext);
  });

  it("round-trip works with empty plaintext", async () => {
    const decryptor = await Decryptor.create();
    const { cryptoKeyHeader, encryptionHeader, ciphertext } = await webPushEncrypt(
      "",
      decryptor.getPublicKeyBase64url(),
      decryptor.getAuthBase64url(),
    );

    expect(await decryptor.decrypt(cryptoKeyHeader, encryptionHeader, ciphertext)).toBe("");
  });

  it("decrypts chunked payload with rs parameter", async () => {
    const decryptor = await Decryptor.create();
    const plaintext = "This payload is split into multiple AES-GCM chunks for decryption";

    const { cryptoKeyHeader, encryptionHeader, ciphertext } = await webPushEncryptChunked(
      plaintext,
      decryptor.getPublicKeyBase64url(),
      decryptor.getAuthBase64url(),
      34, // rs=34 → 18 bytes plaintext per chunk + 16 bytes GCM tag
    );

    expect(encryptionHeader).toContain("rs=34");
    const result = await decryptor.decrypt(cryptoKeyHeader, encryptionHeader, ciphertext);
    expect(result).toBe(plaintext);
  });
});
