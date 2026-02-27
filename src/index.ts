import { Decryptor } from "./decrypt";
import { AutopushClient } from "./autopush";
import {
  registerPush,
  startCheckinLoop,
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

  console.log("Enter your Twitter cookies:");
  const authToken = prompt("  auth_token: ");
  const ct0 = prompt("  ct0: ");

  if (!authToken || !ct0) {
    console.error("Both auth_token and ct0 are required.");
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
    twitter: { authToken, ct0 },
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
    onEndpointChanged: async (newEndpoint: string) => {
      console.log("[main] Endpoint changed, re-registering with Twitter...");
      subscription.endpoint = newEndpoint;
      config.endpoint = newEndpoint;
      await saveConfig(config);
      try {
        await registerPush(config.twitter, subscription);
      } catch (err) {
        console.error("[main] Re-registration failed:", err);
      }
    },
  });

  console.log("[main] Connecting to Autopush...");
  const endpoint = await autopush.connect();
  subscription.endpoint = endpoint;

  // Persist connection state
  config.uaid = autopush.getUaid();
  config.endpoint = endpoint;
  config.remoteBroadcasts = autopush.getRemoteBroadcasts();
  await saveConfig(config);

  console.log(`[main] Connected. UAID: ${config.uaid}`);
  console.log(`[main] Endpoint: ${endpoint}`);

  console.log("[main] Registering with Twitter...");
  await registerPush(config.twitter, subscription);

  startCheckinLoop(config.twitter, subscription, () => {
    console.error("[main] Checkin re-registration failed");
  });

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
