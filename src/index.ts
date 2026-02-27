import { Decryptor } from "./decrypt";
import { AutopushClient } from "./autopush";
import {
  createClient,
  registerPush,
  type PushSubscription,
} from "./twitter";
import { loadConfig, saveConfig } from "./config";
import { ConsoleHandler, FileHandler } from "./handlers";
import { base64urlToBuffer } from "./utils";
import type {
  Config,
  AutopushNotification,
  NotificationHandler,
} from "./types";

const VAPID_KEY =
  "BF5oEo0xDUpgylKDTlsd8pZmxQA1leYINiY-rSscWYK_3tWAkz4VMbtf1MLE_Yyd6iII6o-e3Q9TCN5vZMzVMEs";

async function init(): Promise<void> {
  console.log("Generating ECDH key pair and auth secret...");
  const decryptor = await Decryptor.create();

  console.log(
    "Paste Cookie header from DevTools (Network tab → any request → Cookie header):",
  );
  console.log(
    "  (auth_token is HttpOnly — document.cookie won't include it)",
  );
  const raw = prompt("  cookie: ");

  if (!raw) {
    console.error("Cookie string is required.");
    process.exit(1);
  }

  const cookies: Record<string, string> = {};
  for (const pair of raw.split(";")) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    cookies[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }

  if (!cookies.auth_token || !cookies.ct0) {
    console.error("Cookie must contain auth_token and ct0.");
    process.exit(1);
  }

  const config: Config = {
    uaid: "",
    channelId: crypto.randomUUID(),
    endpoint: "",
    remoteBroadcasts: {},
    decryptor: {
      jwk: decryptor.getJwk(),
      auth: decryptor.getAuthBase64url(),
    },
    twitter: { cookies },
  };

  await saveConfig(config);
  console.log('config.json created. Run "start" to begin receiving notifications.');
}

async function start(): Promise<void> {
  const config = await loadConfig();
  const decryptor = await Decryptor.create(
    config.decryptor.jwk,
    config.decryptor.auth,
  );

  console.log("[main] Initializing Twitter client...");
  const client = await createClient(config.twitter.cookies);

  const handlers: NotificationHandler[] = [
    new ConsoleHandler(),
    new FileHandler(),
  ];

  const subscription: PushSubscription = {
    endpoint: "",
    p256dh: decryptor.getPublicKeyBase64url(),
    auth: decryptor.getAuthBase64url(),
  };

  const autopush = new AutopushClient({
    uaid: config.uaid,
    channelId: config.channelId,
    vapidKey: VAPID_KEY,
    remoteBroadcasts: config.remoteBroadcasts,
    onNotification: async (msg: AutopushNotification) => {
      try {
        const payload = base64urlToBuffer(msg.data);
        const json = await decryptor.decrypt(
          msg.headers.crypto_key,
          msg.headers.encryption,
          payload,
        );
        const notification = JSON.parse(json);
        for (const handler of handlers) {
          await handler.handle(notification);
        }
      } catch (err) {
        console.error("[main] Failed to process notification:", err);
      }
    },
  });

  console.log("[main] Connecting to Autopush...");
  const endpoint = await autopush.connect();
  subscription.endpoint = endpoint;

  const needsRegistration = endpoint !== config.endpoint;

  config.uaid = autopush.getUaid();
  config.endpoint = endpoint;
  config.remoteBroadcasts = autopush.getRemoteBroadcasts();
  await saveConfig(config);

  console.log(`[main] Connected. UAID: ${config.uaid}`);
  console.log(`[main] Endpoint: ${endpoint}`);

  if (needsRegistration) {
    console.log("[main] Registering with Twitter...");
    await registerPush(client, subscription);
  } else {
    console.log("[main] Endpoint unchanged, skipping registration.");
  }

  console.log("[main] Listening for notifications... (Ctrl+C to stop)");

  process.on("SIGINT", () => {
    console.log("\n[main] Shutting down...");
    autopush.close();
    process.exit(0);
  });
}

const command = process.argv[2];
switch (command) {
  case "init":
    init().catch(console.error);
    break;
  case "start":
    start().catch(console.error);
    break;
  default:
    console.log("Usage: bun run src/index.ts <init|start>");
    process.exit(1);
}
