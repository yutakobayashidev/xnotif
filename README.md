# xnotif

[![npm](https://img.shields.io/npm/v/xnotif)](https://www.npmjs.com/package/xnotif)
[![CI](https://github.com/yutakobayashidev/xnotif/actions/workflows/ci.yml/badge.svg)](https://github.com/yutakobayashidev/xnotif/actions/workflows/ci.yml)

Receive Twitter/X notifications in real-time. No API key, no scraping — just Web Push.

```typescript
import { createClient } from "xnotif";

const client = createClient({
  cookies: { auth_token: "...", ct0: "..." },
});

client.on("notification", (n) => {
  console.log(`${n.title}: ${n.body}`);
});

await client.start();
```

## How It Works

```
Twitter ──▶ Mozilla Autopush (WebSocket) ──▶ AESGCM decrypt ──▶ EventEmitter
```

xnotif generates an ECDH key pair, registers it with Twitter's push endpoint using your session cookies, then listens on Mozilla's Autopush WebSocket. Incoming notifications are decrypted and emitted as typed events.

## Install

```bash
bun add xnotif
```

> Requires Bun >= 1.0.0

## Getting Cookies

1. Log in to [x.com](https://x.com)
2. DevTools → Application → Cookies
3. Copy `auth_token` and `ct0`

## State Persistence

Save the `ClientState` from the `connected` event to skip key generation on restart:

```typescript
import { createClient, type ClientState } from "xnotif";

let state: ClientState | undefined = loadFromDisk(); // your persistence

const client = createClient({ cookies: { auth_token: "...", ct0: "..." }, state });

client.on("connected", (s) => saveToDisk(s));

await client.start();
```

## API

### `createClient(options)`

| Option    | Type                                    | Required | Description            |
| --------- | --------------------------------------- | -------- | ---------------------- |
| `cookies` | `{ auth_token: string; ct0: string }`   | Yes      | Session cookies        |
| `state`   | `ClientState`                           | No       | Restore previous state |

### Events

| Event          | Payload                  | Description                           |
| -------------- | ------------------------ | ------------------------------------- |
| `notification` | `TwitterNotification`    | Decrypted notification                |
| `connected`    | `ClientState`            | Connected — persist this state        |
| `error`        | `Error`                  | Error (connection continues)          |
| `disconnected` | —                        | WebSocket closed                      |
| `reconnecting` | `number`                 | Reconnecting in N ms                  |

### Methods

- **`client.start()`** — Connect and begin receiving notifications
- **`client.stop()`** — Disconnect

### Low-level Exports

- `Decryptor` — AESGCM Web Push decryption (ECDH + HKDF + AES-128-GCM)
- `AutopushClient` — Mozilla Autopush WebSocket client

## License

MIT
