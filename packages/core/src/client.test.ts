import { describe, it, expect, vi } from "vitest";
import { NotificationClient, createClient } from "./client";
import type { ClientState, NotificationClientOptions } from "./types";

// Mock internal modules
vi.mock("./decrypt", () => ({
  Decryptor: {
    create: vi.fn(),
  },
}));

vi.mock("./autopush", () => {
  const MockAutopushClient = vi.fn();
  return { AutopushClient: MockAutopushClient };
});

vi.mock("./twitter", () => ({
  createClient: vi.fn(),
  registerPush: vi.fn(),
}));

import { Decryptor } from "./decrypt";
import { AutopushClient } from "./autopush";
import { createClient as createTwitterClient, registerPush } from "./twitter";

// eslint-disable-next-line typescript-eslint/unbound-method -- vitest mock
const decryptorCreate = vi.mocked(Decryptor.create);

function mockDecryptor(publicKey = "pub-key", auth = "auth-secret") {
  const decryptor = {
    getJwk: vi.fn().mockReturnValue({ crv: "P-256", kty: "EC", x: "x", y: "y", d: "d" }),
    getAuthBase64url: vi.fn().mockReturnValue(auth),
    getPublicKeyBase64url: vi.fn().mockReturnValue(publicKey),
    decrypt: vi.fn().mockResolvedValue('{"title":"Test","body":"Hello"}'),
  };
  decryptorCreate.mockResolvedValue(decryptor as any);
  return decryptor;
}

function mockAutopush(endpoint = "https://push.example.com/ep") {
  let onNotification: any;
  let onError: any;
  let onDisconnected: any;
  let onReconnecting: any;

  const instance = {
    connect: vi.fn().mockResolvedValue(endpoint),
    close: vi.fn(),
    getUaid: vi.fn().mockReturnValue("test-uaid"),
    getEndpoint: vi.fn().mockReturnValue(endpoint),
    getRemoteBroadcasts: vi.fn().mockReturnValue({}),
  };

  vi.mocked(AutopushClient).mockImplementation(function (this: any, opts: any) {
    onNotification = opts.onNotification;
    onError = opts.onError;
    onDisconnected = opts.onDisconnected;
    onReconnecting = opts.onReconnecting;
    Object.assign(this, instance);
  } as any);

  return {
    instance,
    triggerNotification: (msg: any) => onNotification?.(msg),
    triggerError: (err: any) => onError?.(err),
    triggerDisconnected: () => onDisconnected?.(),
    triggerReconnecting: (delay: number) => onReconnecting?.(delay),
  };
}

function mockTwitter() {
  const twitterClient = { config: {} };
  vi.mocked(createTwitterClient).mockResolvedValue(twitterClient as any);
  vi.mocked(registerPush).mockResolvedValue(undefined);
  return twitterClient;
}

const defaultOpts: NotificationClientOptions = {
  cookies: { auth_token: "token", ct0: "csrf" },
};

describe("client", () => {
  describe("createClient", () => {
    it("returns a NotificationClient instance", () => {
      const client = createClient(defaultOpts);
      expect(client).toBeInstanceOf(NotificationClient);
    });
  });

  describe("NotificationClient", () => {
    it("start() creates Decryptor, AutopushClient and registers push", async () => {
      mockDecryptor();
      mockAutopush();
      mockTwitter();

      const client = new NotificationClient(defaultOpts);
      await client.start();

      expect(decryptorCreate).toHaveBeenCalledOnce();
      expect(AutopushClient).toHaveBeenCalledOnce();
      expect(createTwitterClient).toHaveBeenCalledWith(defaultOpts.cookies);
      expect(registerPush).toHaveBeenCalledOnce();
    });

    it("start() restores state from options.state", async () => {
      mockDecryptor();
      mockAutopush("https://push.example.com/old-ep");
      mockTwitter();

      const savedState: ClientState = {
        uaid: "saved-uaid",
        channelId: "saved-channel",
        endpoint: "https://push.example.com/old-ep",
        remoteBroadcasts: {},
        decryptor: { jwk: { crv: "P-256", kty: "EC" } as JsonWebKey, auth: "saved-auth" },
      };

      const client = new NotificationClient({ ...defaultOpts, state: savedState });
      await client.start();

      expect(decryptorCreate).toHaveBeenCalledWith(
        savedState.decryptor.jwk,
        savedState.decryptor.auth,
      );
    });

    it("start() skips registerPush when endpoint matches saved state", async () => {
      const endpoint = "https://push.example.com/same-ep";
      mockDecryptor();
      mockAutopush(endpoint);

      const client = new NotificationClient({
        ...defaultOpts,
        state: {
          uaid: "u",
          channelId: "c",
          endpoint,
          remoteBroadcasts: {},
          decryptor: { jwk: {} as JsonWebKey, auth: "a" },
        },
      });
      await client.start();

      expect(createTwitterClient).not.toHaveBeenCalled();
      expect(registerPush).not.toHaveBeenCalled();
    });

    it("start() registers push when endpoint changes", async () => {
      mockDecryptor();
      mockAutopush("https://push.example.com/new-ep");
      mockTwitter();

      const client = new NotificationClient({
        ...defaultOpts,
        state: {
          uaid: "u",
          channelId: "c",
          endpoint: "https://push.example.com/old-ep",
          remoteBroadcasts: {},
          decryptor: { jwk: {} as JsonWebKey, auth: "a" },
        },
      });
      await client.start();

      expect(registerPush).toHaveBeenCalledOnce();
    });

    it("emits connected event with ClientState", async () => {
      mockDecryptor();
      mockAutopush();
      mockTwitter();

      const client = new NotificationClient(defaultOpts);
      const connectedPromise = new Promise<ClientState>((resolve) => {
        client.on("connected", resolve);
      });

      await client.start();
      const state = await connectedPromise;

      expect(state.uaid).toBe("test-uaid");
      expect(state.endpoint).toBe("https://push.example.com/ep");
      expect(state.decryptor.jwk).toBeDefined();
      expect(state.decryptor.auth).toBe("auth-secret");
    });

    it("emits notification event when autopush receives notification", async () => {
      const decryptor = mockDecryptor();
      const autopush = mockAutopush();
      mockTwitter();

      decryptor.decrypt.mockResolvedValue('{"title":"New tweet","body":"@user mentioned you"}');

      const client = new NotificationClient(defaultOpts);
      await client.start();

      const notifPromise = new Promise<any>((resolve) => {
        client.on("notification", resolve);
      });

      autopush.triggerNotification({
        messageType: "notification",
        channelID: "chan",
        version: "v1",
        data: "ZW5jcnlwdGVk",
        headers: { crypto_key: "dh=key", encryption: "salt=s" },
      });

      const notification = await notifPromise;
      expect(notification.title).toBe("New tweet");
    });

    it("emits error event on decrypt failure", async () => {
      const decryptor = mockDecryptor();
      const autopush = mockAutopush();
      mockTwitter();

      decryptor.decrypt.mockRejectedValue(new Error("decrypt failed"));

      const client = new NotificationClient(defaultOpts);
      await client.start();

      const errorPromise = new Promise<Error>((resolve) => {
        client.on("error", resolve);
      });

      autopush.triggerNotification({
        messageType: "notification",
        channelID: "chan",
        version: "v1",
        data: "bad",
        headers: { crypto_key: "ck", encryption: "enc" },
      });

      const error = await errorPromise;
      expect(error.message).toBe("decrypt failed");
    });

    it("emits disconnected and reconnecting events", async () => {
      mockDecryptor();
      const autopush = mockAutopush();
      mockTwitter();

      const client = new NotificationClient(defaultOpts);
      await client.start();

      const disconnectedPromise = new Promise<void>((resolve) => {
        client.on("disconnected", resolve);
      });
      const reconnectingPromise = new Promise<number>((resolve) => {
        client.on("reconnecting", resolve);
      });

      autopush.triggerDisconnected();
      autopush.triggerReconnecting(1000);

      await disconnectedPromise;
      const delay = await reconnectingPromise;
      expect(delay).toBe(1000);
    });

    it("stop() closes autopush connection", async () => {
      mockDecryptor();
      const autopush = mockAutopush();
      mockTwitter();

      const client = new NotificationClient(defaultOpts);
      await client.start();
      client.stop();

      expect(autopush.instance.close).toHaveBeenCalledOnce();
    });

    it("start() is idempotent when already running", async () => {
      mockDecryptor();
      mockAutopush();
      mockTwitter();

      const client = new NotificationClient(defaultOpts);
      await client.start();
      await client.start();

      expect(decryptorCreate).toHaveBeenCalledOnce();
    });

    describe("filter option", () => {
      const notificationMsg = {
        messageType: "notification" as const,
        channelID: "chan",
        version: "v1",
        data: "ZW5jcnlwdGVk",
        headers: { crypto_key: "dh=key", encryption: "salt=s" },
      };

      it("emits notification when filter returns true", async () => {
        const decryptor = mockDecryptor();
        const autopush = mockAutopush();
        mockTwitter();
        decryptor.decrypt.mockResolvedValue(
          '{"title":"Test","body":"hello","data":{"type":"tweet"}}',
        );

        const filter = vi.fn().mockReturnValue(true);
        const client = new NotificationClient({ ...defaultOpts, filter });
        await client.start();

        const notifPromise = new Promise<any>((resolve) => {
          client.on("notification", resolve);
        });
        autopush.triggerNotification(notificationMsg);

        const notification = await notifPromise;
        expect(notification.title).toBe("Test");
        expect(filter).toHaveBeenCalledWith(expect.objectContaining({ title: "Test" }));
      });

      it("does not emit notification when filter returns false", async () => {
        const decryptor = mockDecryptor();
        const autopush = mockAutopush();
        mockTwitter();
        decryptor.decrypt.mockResolvedValue('{"title":"Filtered","body":"nope"}');

        const filter = vi.fn().mockReturnValue(false);
        const client = new NotificationClient({ ...defaultOpts, filter });
        await client.start();

        const notifHandler = vi.fn();
        client.on("notification", notifHandler);
        autopush.triggerNotification(notificationMsg);

        // Wait for async onNotification to complete
        await new Promise((r) => setTimeout(r, 10));
        expect(notifHandler).not.toHaveBeenCalled();
        expect(filter).toHaveBeenCalledOnce();
      });

      it("emits error and discards notification when filter throws", async () => {
        const decryptor = mockDecryptor();
        const autopush = mockAutopush();
        mockTwitter();
        decryptor.decrypt.mockResolvedValue('{"title":"Boom","body":"err"}');

        const filter = vi.fn().mockImplementation(() => {
          throw new Error("filter exploded");
        });
        const client = new NotificationClient({ ...defaultOpts, filter });
        await client.start();

        const notifHandler = vi.fn();
        client.on("notification", notifHandler);
        const errorPromise = new Promise<Error>((resolve) => {
          client.on("error", resolve);
        });
        autopush.triggerNotification(notificationMsg);

        const error = await errorPromise;
        expect(error.message).toBe("filter exploded");
        expect(notifHandler).not.toHaveBeenCalled();
      });

      it("emits all notifications when filter is not specified", async () => {
        const decryptor = mockDecryptor();
        const autopush = mockAutopush();
        mockTwitter();
        decryptor.decrypt.mockResolvedValue('{"title":"NoFilter","body":"pass"}');

        const client = new NotificationClient(defaultOpts);
        await client.start();

        const notifPromise = new Promise<any>((resolve) => {
          client.on("notification", resolve);
        });
        autopush.triggerNotification(notificationMsg);

        const notification = await notifPromise;
        expect(notification.title).toBe("NoFilter");
      });
    });

    it("start() throws and resets state on failure", async () => {
      decryptorCreate.mockRejectedValue(new Error("key gen failed"));

      const client = new NotificationClient(defaultOpts);
      await expect(client.start()).rejects.toThrow("key gen failed");

      // Should be able to start again after failure
      mockDecryptor();
      mockAutopush();
      mockTwitter();
      await client.start();
      expect(decryptorCreate).toHaveBeenCalledTimes(2);
    });
  });
});
