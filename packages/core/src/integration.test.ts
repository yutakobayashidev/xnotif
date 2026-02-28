import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ClientState, TwitterNotification } from "./types";
import { base64urlToBuffer, bufferToBase64url, concatBuffers } from "./utils";

// Capture subscription for server-side encryption
let capturedSubscription: { p256dh: string; auth: string } | null = null;

// Mock external boundaries only — let internal modules (decrypt, autopush, utils) use real code
vi.mock("twitter-openapi-typescript-generated", async () => {
	const actual = await vi.importActual("twitter-openapi-typescript-generated");
	return {
		...actual,
		BaseAPI: class MockBaseAPI {
			configuration: any;
			constructor(config: any) {
				this.configuration = config;
			}
			async request(context: any): Promise<Response> {
				if (context.body?.push_device_info) {
					capturedSubscription = {
						p256dh: context.body.push_device_info.encryption_key1,
						auth: context.body.push_device_info.encryption_key2,
					};
				}
				return new Response("ok", { status: 200 });
			}
		},
	};
});

vi.mock("twitter-openapi-typescript", () => ({
	TwitterOpenApi: class {
		getClientFromCookies = vi.fn().mockResolvedValue({
			config: {
				apiKey: vi.fn().mockResolvedValue("mock-value"),
				accessToken: vi.fn().mockResolvedValue("mock-token"),
			},
			initOverrides: vi.fn().mockReturnValue(vi.fn()),
		});
	},
}));

// Auto-responding MockWebSocket — drives the autopush handshake without manual intervention
class AutoRespondWebSocket {
	static CONNECTING = 0 as const;
	static OPEN = 1 as const;
	static CLOSING = 2 as const;
	static CLOSED = 3 as const;

	static instances: AutoRespondWebSocket[] = [];
	static reset() {
		AutoRespondWebSocket.instances = [];
	}

	onopen: ((event: Event) => void) | null = null;
	onmessage: ((event: MessageEvent) => void) | null = null;
	onclose: ((event: CloseEvent) => void) | null = null;
	onerror: ((event: Event) => void) | null = null;
	readyState = AutoRespondWebSocket.CONNECTING;
	sent: string[] = [];

	constructor(
		public url: string,
		public protocols?: string | string[],
	) {
		AutoRespondWebSocket.instances.push(this);
		queueMicrotask(() => {
			this.readyState = AutoRespondWebSocket.OPEN;
			this.onopen?.(new Event("open"));
		});
	}

	send(data: string) {
		this.sent.push(data);
		const msg = JSON.parse(data);
		queueMicrotask(() => {
			if (msg.messageType === "hello") {
				this.respond({ messageType: "hello", uaid: "integration-uaid", broadcasts: {} });
			} else if (msg.messageType === "register") {
				this.respond({
					messageType: "register",
					status: 200,
					pushEndpoint: "https://push.example.com/integration",
				});
			}
		});
	}

	close() {
		this.readyState = AutoRespondWebSocket.CLOSED;
	}

	respond(data: unknown) {
		this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(data) }));
	}
}

// Server-side AESGCM encryption (mirrors decrypt.test.ts)
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

import { NotificationClient, createClient } from "./client";

describe("Integration: notification pipeline", () => {
	beforeEach(() => {
		AutoRespondWebSocket.reset();
		capturedSubscription = null;
		vi.stubGlobal("WebSocket", AutoRespondWebSocket);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("receives and decrypts a push notification end-to-end", async () => {
		const client = createClient({ cookies: { auth_token: "token", ct0: "csrf" } });

		const connectedPromise = new Promise<ClientState>((resolve) => {
			client.on("connected", resolve);
		});
		const notifPromise = new Promise<TwitterNotification>((resolve) => {
			client.on("notification", resolve);
		});

		await client.start();

		const state = await connectedPromise;
		expect(state.uaid).toBe("integration-uaid");
		expect(state.endpoint).toBe("https://push.example.com/integration");
		expect(state.decryptor.jwk.crv).toBe("P-256");

		// Subscription was registered with Twitter
		expect(capturedSubscription).not.toBeNull();

		// Encrypt a notification using the real keys
		const payload = JSON.stringify({
			title: "Integration Test",
			body: "@user liked your tweet",
		});
		const { cryptoKeyHeader, encryptionHeader, ciphertext } = await webPushEncrypt(
			payload,
			capturedSubscription!.p256dh,
			capturedSubscription!.auth,
		);

		// Simulate push notification on WebSocket
		const ws = AutoRespondWebSocket.instances[0];
		ws.respond({
			messageType: "notification",
			channelID: "chan",
			version: "v1",
			data: bufferToBase64url(ciphertext),
			headers: {
				crypto_key: cryptoKeyHeader,
				encryption: encryptionHeader,
			},
		});

		const notification = await notifPromise;
		expect(notification.title).toBe("Integration Test");
		expect(notification.body).toBe("@user liked your tweet");

		// Verify ack was sent
		const ackMsg = ws.sent.map((s) => JSON.parse(s)).find((m) => m.messageType === "ack");
		expect(ackMsg).toBeDefined();
		expect(ackMsg.updates[0].channelID).toBe("chan");

		client.stop();
	});

	it("restores from saved state and skips re-registration when endpoint matches", async () => {
		const endpoint = "https://push.example.com/integration";

		// Generate a real ECDH key pair for the saved state
		const keyPair = await crypto.subtle.generateKey(
			{ name: "ECDH", namedCurve: "P-256" },
			true,
			["deriveBits"],
		);
		const jwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
		const auth = bufferToBase64url(crypto.getRandomValues(new Uint8Array(16)).buffer);

		const savedState: ClientState = {
			uaid: "saved-uaid",
			channelId: "saved-channel",
			endpoint,
			remoteBroadcasts: {},
			decryptor: { jwk, auth },
		};

		const client = new NotificationClient({
			cookies: { auth_token: "t", ct0: "c" },
			state: savedState,
		});
		await client.start();

		// Same endpoint → no re-registration
		expect(capturedSubscription).toBeNull();

		client.stop();
	});
});
