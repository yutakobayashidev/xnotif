const BEARER_TOKEN =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
const TWITTER_API = "https://api.twitter.com";

interface TwitterAuth {
  authToken: string;
  ct0: string;
}

export interface PushSubscription {
  endpoint: string;
  p256dh: string; // base64url
  auth: string; // base64url
}

export async function registerPush(
  twitterAuth: TwitterAuth,
  subscription: PushSubscription,
): Promise<void> {
  const body = new URLSearchParams({
    token: subscription.endpoint,
    encryption_key: subscription.p256dh,
    encryption_auth: subscription.auth,
    env: "1",
  });

  const res = await fetch(
    `${TWITTER_API}/1.1/notifications/settings/login.json`,
    {
      method: "POST",
      headers: makeHeaders(twitterAuth),
      body: body.toString(),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Twitter login.json failed (${res.status}): ${text}`);
  }

  console.log("[twitter] Push registration successful");
}

export async function checkin(
  twitterAuth: TwitterAuth,
  subscription: PushSubscription,
): Promise<boolean> {
  const body = new URLSearchParams({
    token: subscription.endpoint,
    encryption_key: subscription.p256dh,
    encryption_auth: subscription.auth,
    env: "1",
  });

  const res = await fetch(
    `${TWITTER_API}/1.1/notifications/settings/checkin.json`,
    {
      method: "POST",
      headers: makeHeaders(twitterAuth),
      body: body.toString(),
    },
  );

  if (!res.ok) {
    console.error(`[twitter] Checkin failed (${res.status})`);
    return false;
  }

  console.log("[twitter] Checkin successful");
  return true;
}

export function startCheckinLoop(
  twitterAuth: TwitterAuth,
  subscription: PushSubscription,
  onReregistrationFailed: () => void,
): Timer {
  return setInterval(
    async () => {
      const ok = await checkin(twitterAuth, subscription);
      if (!ok) {
        try {
          await registerPush(twitterAuth, subscription);
        } catch (err) {
          console.error("[twitter] Re-registration failed:", err);
          onReregistrationFailed();
        }
      }
    },
    2 * 60 * 60 * 1000,
  ); // 2 hours
}

function makeHeaders(auth: TwitterAuth): Record<string, string> {
  return {
    Authorization: `Bearer ${BEARER_TOKEN}`,
    "Content-Type": "application/x-www-form-urlencoded",
    Cookie: `auth_token=${auth.authToken}; ct0=${auth.ct0}`,
    "x-csrf-token": auth.ct0,
  };
}
