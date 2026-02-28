import { describe, it, expect, vi, beforeEach } from "vitest";

let lastRequestContext: any = null;
let lastInitOverride: any = null;
let mockResponse: Response = new Response("ok", { status: 200 });

vi.mock("twitter-openapi-typescript-generated", async () => {
  const actual = await vi.importActual("twitter-openapi-typescript-generated");
  return {
    ...actual,
    BaseAPI: class MockBaseAPI {
      configuration: any;
      constructor(config: any) {
        this.configuration = config;
      }
      async request(context: any, initOverride?: any): Promise<Response> {
        lastRequestContext = context;
        lastInitOverride = initOverride;
        return mockResponse;
      }
    },
  };
});

const mockGetClientFromCookies = vi.fn();

vi.mock("twitter-openapi-typescript", () => ({
  TwitterOpenApi: class {
    getClientFromCookies = mockGetClientFromCookies;
  },
}));

import { createClient, registerPush, type PushSubscription } from "./twitter";
import type { TwitterOpenApiClient } from "twitter-openapi-typescript";

function makeMockClient(): TwitterOpenApiClient {
  return {
    config: {
      apiKey: vi.fn().mockResolvedValue("mock-header-value"),
      accessToken: vi.fn().mockResolvedValue("mock-access-token"),
    },
    initOverrides: vi.fn().mockReturnValue(vi.fn()),
  } as unknown as TwitterOpenApiClient;
}

const testSubscription: PushSubscription = {
  endpoint: "https://push.example.com/sub/abc123",
  p256dh: "BPl7qKAgMz-randomP256dhKey",
  auth: "randomAuthKey123",
};

describe("twitter", () => {
  describe("createClient", () => {
    it("calls getClientFromCookies with the provided cookies", async () => {
      const cookies = { ct0: "csrf-token", auth_token: "auth123" };
      const fakeClient = makeMockClient();
      mockGetClientFromCookies.mockResolvedValue(fakeClient);

      const result = await createClient(cookies);
      expect(mockGetClientFromCookies).toHaveBeenCalledWith(cookies);
      expect(result).toBe(fakeClient);
    });
  });

  describe("registerPush", () => {
    beforeEach(() => {
      lastRequestContext = null;
      lastInitOverride = null;
      mockResponse = new Response("ok", { status: 200 });
    });

    it("sends POST to /1.1/notifications/settings/login.json", async () => {
      const client = makeMockClient();
      await registerPush(client, testSubscription);

      expect(lastRequestContext.path).toBe("/1.1/notifications/settings/login.json");
      expect(lastRequestContext.method).toBe("POST");
    });

    it("sends correct push_device_info body", async () => {
      const client = makeMockClient();
      await registerPush(client, testSubscription);

      expect(lastRequestContext.body).toEqual({
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

    it("sets Content-Type header", async () => {
      const client = makeMockClient();
      await registerPush(client, testSubscription);

      expect(lastRequestContext.headers["Content-Type"]).toBe("application/json");
    });

    it("populates API headers from config.apiKey", async () => {
      const client = makeMockClient();
      await registerPush(client, testSubscription);

      const apiKey = client.config.apiKey as ReturnType<typeof vi.fn>;
      expect(apiKey).toHaveBeenCalled();
      const calledNames = apiKey.mock.calls.map((c: any[]) => c[0]);
      expect(calledNames).toContain("x-csrf-token");
      expect(calledNames).toContain("user-agent");
    });

    it("sets Authorization header from accessToken", async () => {
      const client = makeMockClient();
      await registerPush(client, testSubscription);

      expect(lastRequestContext.headers["Authorization"]).toBe("Bearer mock-access-token");
    });

    it("does not throw on 200 response", async () => {
      const client = makeMockClient();
      await expect(registerPush(client, testSubscription)).resolves.toBeUndefined();
    });

    it("throws on non-ok response (status 403)", async () => {
      const client = makeMockClient();
      mockResponse = new Response("Forbidden", { status: 403 });

      await expect(registerPush(client, testSubscription)).rejects.toThrow(
        "login.json failed (403): Forbidden",
      );
    });

    it("throws on non-ok response (status 500)", async () => {
      const client = makeMockClient();
      mockResponse = new Response("Internal Server Error", { status: 500 });

      await expect(registerPush(client, testSubscription)).rejects.toThrow(
        "login.json failed (500): Internal Server Error",
      );
    });
  });
});
