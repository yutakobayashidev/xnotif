import { beforeEach, describe, it, expect, vi, afterEach } from "vitest";
import { createClient, registerPush, type PushSubscription, type TwitterClient } from "./twitter";

const HEADER_URL =
  "https://raw.githubusercontent.com/fa0311/latest-user-agent/refs/heads/main/header.json";
const PAIR_URL =
  "https://raw.githubusercontent.com/fa0311/x-client-transaction-pair-dict/refs/heads/main/pair.json";

const fakeHeaders = {
  "chrome-fetch": {
    accept: "*/*",
    "user-agent": "MockChrome/1.0",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
  },
};

const fakePairs = [{ verification: "dGVzdA", animationKey: "abc123" }];

let lastFetchUrl: string | undefined;
let lastFetchInit: RequestInit | undefined;
let mockRegisterResponse: Response;

const originalFetch = globalThis.fetch;

function stubFetch() {
  mockRegisterResponse = new Response("ok", { status: 200 });

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === HEADER_URL) return new Response(JSON.stringify(fakeHeaders));
      if (url === PAIR_URL) return new Response(JSON.stringify(fakePairs));
      // API call
      lastFetchUrl = url;
      lastFetchInit = init;
      return mockRegisterResponse;
    }),
  );
}

const testSubscription: PushSubscription = {
  endpoint: "https://push.example.com/sub/abc123",
  p256dh: "BPl7qKAgMz-randomP256dhKey",
  auth: "randomAuthKey123",
};

describe("twitter", () => {
  beforeEach(() => {
    lastFetchUrl = undefined;
    lastFetchInit = undefined;
    stubFetch();
  });

  afterEach(() => {
    vi.stubGlobal("fetch", originalFetch);
  });

  describe("createClient", () => {
    it("fetches headers and pairs, maps cookies to auth headers", async () => {
      const client = await createClient({ ct0: "csrf-token", auth_token: "auth123" });

      expect(client.headers["x-csrf-token"]).toBe("csrf-token");
      expect(client.headers["x-twitter-auth-type"]).toBe("OAuth2Session");
      expect(client.headers["authorization"]).toMatch(/^Bearer /);
      expect(client.headers["user-agent"]).toBe("MockChrome/1.0");
      expect(client.pairs).toEqual(fakePairs);
    });

    it("sets x-guest-token when gt cookie is present", async () => {
      const client = await createClient({ gt: "guest-123" });
      expect(client.headers["x-guest-token"]).toBe("guest-123");
    });

    it("excludes host and connection from fetched headers", async () => {
      const headersWithHostConn = {
        "chrome-fetch": {
          host: "x.com",
          connection: "keep-alive",
          accept: "*/*",
        },
      };
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string | URL | Request) => {
          const url =
            typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
          if (url === HEADER_URL) return new Response(JSON.stringify(headersWithHostConn));
          if (url === PAIR_URL) return new Response(JSON.stringify(fakePairs));
          return new Response("ok");
        }),
      );

      const client = await createClient({ ct0: "t" });
      expect(client.headers["host"]).toBeUndefined();
      expect(client.headers["connection"]).toBeUndefined();
      expect(client.headers["accept"]).toBe("*/*");
    });
  });

  describe("registerPush", () => {
    let client: TwitterClient;

    beforeEach(async () => {
      client = await createClient({ ct0: "csrf", auth_token: "tok" });
    });

    it("sends POST to /1.1/notifications/settings/login.json", async () => {
      await registerPush(client, testSubscription);

      expect(lastFetchUrl).toBe("https://x.com/i/api/1.1/notifications/settings/login.json");
      expect(lastFetchInit?.method).toBe("POST");
    });

    it("sends correct push_device_info body", async () => {
      await registerPush(client, testSubscription);

      const body = JSON.parse(lastFetchInit!.body as string);
      expect(body).toEqual({
        push_device_info: {
          os_version: "Web/Chrome",
          udid: "Web/Chrome",
          env: 3,
          locale: "en",
          protocol_version: 1,
          token: testSubscription.endpoint,
          encryption_key1: testSubscription.p256dh,
          encryption_key2: testSubscription.auth,
        },
      });
    });

    it("includes required headers", async () => {
      await registerPush(client, testSubscription);

      const headers = lastFetchInit!.headers as Record<string, string>;
      expect(headers["content-type"]).toBe("application/json");
      expect(headers["x-csrf-token"]).toBe("csrf");
      expect(headers["authorization"]).toMatch(/^Bearer /);
      expect(headers["cookie"]).toContain("ct0=csrf");
      expect(headers["x-client-transaction-id"]).toBeDefined();
    });

    it("does not throw on 200 response", async () => {
      await expect(registerPush(client, testSubscription)).resolves.toBeUndefined();
    });

    it("throws on non-ok response (status 403)", async () => {
      mockRegisterResponse = new Response("Forbidden", { status: 403 });
      await expect(registerPush(client, testSubscription)).rejects.toThrow(
        "login.json failed (403): Forbidden",
      );
    });

    it("throws on non-ok response (status 500)", async () => {
      mockRegisterResponse = new Response("Internal Server Error", { status: 500 });
      await expect(registerPush(client, testSubscription)).rejects.toThrow(
        "login.json failed (500): Internal Server Error",
      );
    });
  });
});
