const BEARER_TOKEN =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
const HEADER_URL =
  "https://raw.githubusercontent.com/fa0311/latest-user-agent/refs/heads/main/header.json";
const PAIR_URL =
  "https://raw.githubusercontent.com/fa0311/x-client-transaction-pair-dict/refs/heads/main/pair.json";

export interface PushSubscription {
  endpoint: string;
  p256dh: string; // base64url
  auth: string; // base64url
}

export interface TwitterClient {
  headers: Record<string, string>;
  cookies: Record<string, string>;
  pairs: Array<{ verification: string; animationKey: string }>;
}

// Vendored from x-client-transaction-id-generater/src/encode.js
async function generateTransactionId(
  method: string,
  path: string,
  key: string,
  animationKey: string,
): Promise<string> {
  const DEFAULT_KEYWORD = "obfiowerehiring";
  const ADDITIONAL_RANDOM_NUMBER = 3;
  const timeNow = Math.floor((Date.now() - 1682924400 * 1000) / 1000);
  const timeNowBytes = [
    timeNow & 0xff,
    (timeNow >> 8) & 0xff,
    (timeNow >> 16) & 0xff,
    (timeNow >> 24) & 0xff,
  ];

  const data = `${method}!${path}!${timeNow}${DEFAULT_KEYWORD}${animationKey}`;
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  const hashBytes = Array.from(new Uint8Array(hashBuffer));
  const keyBytes = Array.from(Buffer.from(key, "base64"));

  const randomNum = Math.floor(Math.random() * 256);
  const bytesArr = [
    ...keyBytes,
    ...timeNowBytes,
    ...hashBytes.slice(0, 16),
    ADDITIONAL_RANDOM_NUMBER,
  ];
  const out = new Uint8Array([randomNum, ...bytesArr.map((b) => b ^ randomNum)]);

  return Buffer.from(out).toString("base64").replace(/=/g, "");
}

function encodeCookies(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

export async function createClient(cookies: Record<string, string>): Promise<TwitterClient> {
  const [headerJson, pairs] = await Promise.all([
    fetch(HEADER_URL).then((r) => r.json()),
    fetch(PAIR_URL).then((r) => r.json()),
  ]);

  const ignore = new Set(["host", "connection"]);
  const chromeFetch: Record<string, string> = Object.fromEntries(
    Object.entries(headerJson["chrome-fetch"] as Record<string, string>).filter(
      ([k]) => !ignore.has(k),
    ),
  );

  const headers: Record<string, string> = {
    ...chromeFetch,
    "accept-encoding": "identity",
    pragma: "no-cache",
    referer: "https://x.com",
    priority: "u=1, i",
    "x-twitter-client-language": "en",
    "x-twitter-active-user": "yes",
    authorization: `Bearer ${BEARER_TOKEN}`,
  };

  if (cookies["ct0"]) {
    headers["x-twitter-auth-type"] = "OAuth2Session";
    headers["x-csrf-token"] = cookies["ct0"];
  }
  if (cookies["gt"]) {
    headers["x-guest-token"] = cookies["gt"];
  }

  return { headers, cookies, pairs };
}

export async function registerPush(
  client: TwitterClient,
  subscription: PushSubscription,
): Promise<void> {
  const path = "/1.1/notifications/settings/login.json";

  const pair = client.pairs[Math.floor(Math.random() * client.pairs.length)];
  const tid = await generateTransactionId("POST", path, pair.verification, pair.animationKey);

  const res = await fetch(`https://x.com/i/api${path}`, {
    method: "POST",
    headers: {
      ...client.headers,
      cookie: encodeCookies(client.cookies),
      "content-type": "application/json",
      "x-client-transaction-id": tid,
    },
    body: JSON.stringify({
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
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`login.json failed (${res.status}): ${text}`);
  }
}
