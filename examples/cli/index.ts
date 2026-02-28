import { createClient, Decryptor, type ClientState, type TwitterNotification } from "xnotif";
import { readFile, writeFile, appendFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "config.json");
const TWEETS_PATH = join(__dirname, "tweets.jsonl");

interface StoredConfig {
  state: ClientState;
  cookies: { auth_token: string; ct0: string; [key: string]: string };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function loadConfig(): Promise<StoredConfig> {
  if (!(await fileExists(CONFIG_PATH))) {
    console.error("config.json not found. Run 'init' first.");
    process.exit(1);
  }
  return JSON.parse(await readFile(CONFIG_PATH, "utf-8"));
}

async function saveConfig(config: StoredConfig): Promise<void> {
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

async function appendTweet(notification: TwitterNotification): Promise<void> {
  const line = JSON.stringify({ ...notification, _receivedAt: new Date().toISOString() }) + "\n";
  await appendFile(TWEETS_PATH, line);
}

async function init(): Promise<void> {
  console.log("Generating ECDH key pair and auth secret...");
  const decryptor = await Decryptor.create();

  console.log("Paste Cookie header from DevTools (Network tab → any request → Cookie header):");
  console.log("  (auth_token is HttpOnly — document.cookie won't include it)");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const raw = await rl.question("  cookie: ");
  rl.close();

  if (!raw) {
    console.error("Cookie string is required.");
    process.exit(1);
  }

  const parsed: Record<string, string> = {};
  for (const pair of raw.split(";")) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    parsed[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }

  if (!parsed.auth_token || !parsed.ct0) {
    console.error("Cookie must contain auth_token and ct0.");
    process.exit(1);
  }

  const cookies = parsed as StoredConfig["cookies"];

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

  client.on("notification", (notification) => {
    const ts = new Date().toISOString();
    const tag = notification.tag ?? "unknown";
    const uri = notification.data?.uri ?? "";
    console.log(`[${ts}] [${tag}] ${notification.title}: ${notification.body}`);
    if (uri) console.log(`  -> https://x.com${uri}`);
    void appendTweet(notification);
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
    console.log("Usage: pnpm run <init|start>");
    process.exit(1);
}
