import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ClientState, TwitterNotification } from "./types";
import { bufferToBase64url } from "./utils";
import { webPushEncrypt } from "./test-encrypt";

let capturedSubscription: { p256dh: string; auth: string } | null = null;

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

import { NotificationClient, createClient } from "./client";

describe("integration", () => {
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
    const keyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
      "deriveBits",
    ]);
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
