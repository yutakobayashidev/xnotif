import {
  TwitterOpenApi,
  type TwitterOpenApiClient,
} from "twitter-openapi-typescript";
import {
  BaseAPI,
  type Configuration,
  type HTTPHeaders,
  type HTTPBody,
  type InitOverrideFunction,
} from "twitter-openapi-typescript-generated";

export interface PushSubscription {
  endpoint: string;
  p256dh: string; // base64url
  auth: string; // base64url
}

// Header names populated by generated API classes via config.apiKey()
const API_HEADER_NAMES = [
  "Accept",
  "x-twitter-client-language",
  "Priority",
  "Referer",
  "Sec-Fetch-Dest",
  "Sec-Ch-Ua-Platform",
  "Sec-Fetch-Mode",
  "x-csrf-token",
  "x-client-uuid",
  "x-guest-token",
  "Sec-Ch-Ua",
  "x-twitter-active-user",
  "user-agent",
  "Accept-Language",
  "Sec-Fetch-Site",
  "x-twitter-auth-type",
  "Sec-Ch-Ua-Mobile",
  "Accept-Encoding",
];

// Subclass BaseAPI to expose the protected request() method
class NotificationApi extends BaseAPI {
  constructor(config: Configuration) {
    super(config);
  }

  async post(
    path: string,
    body: unknown,
    initOverride?: InitOverrideFunction,
  ): Promise<Response> {
    const headers: HTTPHeaders = {};

    // Populate headers from apiKey (same pattern as generated V11PostApi)
    const apiKey = this.configuration.apiKey;
    if (apiKey) {
      for (const name of API_HEADER_NAMES) {
        const value = await apiKey(name);
        if (value) headers[name] = value;
      }
    }

    // Authorization via accessToken
    const accessToken = this.configuration.accessToken;
    if (accessToken) {
      headers["Authorization"] = `Bearer ${await accessToken()}`;
    }

    headers["Content-Type"] = "application/json";

    return this.request(
      { path, method: "POST", headers, body: body as HTTPBody },
      initOverride,
    );
  }
}

export async function createClient(
  cookies: Record<string, string>,
): Promise<TwitterOpenApiClient> {
  const api = new TwitterOpenApi();
  return api.getClientFromCookies(cookies);
}

function makeInitOverride(
  client: TwitterOpenApiClient,
  path: string,
): InitOverrideFunction {
  return client.initOverrides({
    "@method": "POST",
    "@path": path,
  });
}

export async function registerPush(
  client: TwitterOpenApiClient,
  subscription: PushSubscription,
): Promise<void> {
  const api = new NotificationApi(client.config);
  const path = "/1.1/notifications/settings/login.json";

  const res = await api.post(
    path,
    {
      push_device_info: {
        os_version: "Web/Chrome",
        udid: "Web/Chrome",
        env: 3,
        locale: "en",
        protocol_version: 1,
        token: subscription.endpoint,
        encryption_key1: subscription.p256dh,
        encryption_key2: subscription.auth,
      },
    },
    makeInitOverride(client, path),
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`login.json failed (${res.status}): ${text}`);
  }

  console.log("[twitter] Push registration successful");
}

