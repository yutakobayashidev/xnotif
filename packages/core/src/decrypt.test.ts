import { describe, expect, it } from "vitest";
import { Decryptor } from "./decrypt";
import { base64urlToBuffer, bufferToBase64url, concatBuffers } from "./utils";

// Test-side HKDF (mirrors production implementation)
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

// Server-side AESGCM encryption for testing decrypt
async function webPushEncrypt(
	plaintext: string,
	decryptorPublicKeyBase64url: string,
	authBase64url: string,
): Promise<{ cryptoKeyHeader: string; encryptionHeader: string; ciphertext: ArrayBuffer }> {
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
});
