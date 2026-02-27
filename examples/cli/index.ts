import { createClient, Decryptor, type ClientState, type TwitterNotification } from "xnotif";

const CONFIG_PATH = import.meta.dir + "/config.json";
const TWEETS_PATH = import.meta.dir + "/tweets.json";

interface StoredConfig {
  state: ClientState;
  cookies: Record<string, string>;
}

async function loadConfig(): Promise<StoredConfig> {
  const file = Bun.file(CONFIG_PATH);
  if (!(await file.exists())) {
    console.error("config.json not found. Run 'init' first.");
    process.exit(1);
  }
  return file.json();
}

async function saveConfig(config: StoredConfig): Promise<void> {
  await Bun.write(CONFIG_PATH, JSON.stringify(config, null, 2));
}

async function appendTweet(notification: TwitterNotification): Promise<void> {
  const file = Bun.file(TWEETS_PATH);
  const tweets: TwitterNotification[] = (await file.exists()) ? await file.json() : [];
  tweets.push({ ...notification, _receivedAt: new Date().toISOString() });
  await Bun.write(TWEETS_PATH, JSON.stringify(tweets, null, 2));
}

async function init(): Promise<void> {
  console.log("Generating ECDH key pair and auth secret...");
  const decryptor = await Decryptor.create();

  console.log("Paste Cookie header from DevTools (Network tab → any request → Cookie header):");
  console.log("  (auth_token is HttpOnly — document.cookie won't include it)");
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

  const config: StoredConfig = {
    state: {
      uaid: "",
      channelId: crypto.randomUUID(),
      endpoint: "",
      remoteBroadcasts: {},
      decryptor: {
        jwk: decryptor.getJwk(),
        auth: decryptor.getAuthBase64url(),
      },
    },
    cookies,
  };

  await saveConfig(config);
  console.log('config.json created. Run "start" to begin receiving notifications.');
}

async function start(): Promise<void> {
  const config = await loadConfig();

  const client = createClient({
    cookies: config.cookies,
    state: config.state,
  });

  client.on("notification", async (notification) => {
    const ts = new Date().toISOString();
    const tag = notification.tag ?? "unknown";
    const uri = notification.data?.uri ?? "";
    console.log(`[${ts}] [${tag}] ${notification.title}: ${notification.body}`);
    if (uri) console.log(`  -> https://x.com${uri}`);
    await appendTweet(notification);
  });

  client.on("connected", async (state) => {
    config.state = state;
    await saveConfig(config);
    console.log(`[main] Connected. UAID: ${state.uaid}`);
  });

  client.on("error", (err) => {
    console.error("[main] Error:", err.message);
  });

  client.on("disconnected", () => {
    console.log("[main] Disconnected.");
  });

  client.on("reconnecting", (delay) => {
    console.log(`[main] Reconnecting in ${delay / 1000}s...`);
  });

  console.log("[main] Connecting...");
  await client.start();
  console.log("[main] Listening for notifications... (Ctrl+C to stop)");

  process.on("SIGINT", () => {
    console.log("\n[main] Shutting down...");
    client.stop();
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
    console.log("Usage: bun run index.ts <init|start>");
    process.exit(1);
}
