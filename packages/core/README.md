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

## Install

```bash
bun add xnotif
```

> Requires Bun >= 1.0.0

## Notification Payload

Each `notification` event delivers a `TwitterNotification` object:

```jsonc
{
  "title": "@jack",
  "body": "just setting up my twttr",
  "icon": "https://pbs.twimg.com/profile_images/...",
  "timestamp": 1142974214000,
  "tag": "mention_12345",
  "data": {
    "type": "mention",
    "uri": "https://x.com/i/web/status/20",
    "title": "@jack",
    "body": "just setting up my twttr",
    "tag": "mention_12345",
    "lang": "en",
    "scribe_target": "mention",
    "impression_id": "abc123"
  }
}
```

Top-level fields:

| Field       | Type       | Description                                       |
| ----------- | ---------- | ------------------------------------------------- |
| `title`     | `string`   | Who triggered the notification                    |
| `body`      | `string`   | Human-readable description                        |
| `icon`      | `string?`  | Profile image URL                                 |
| `timestamp` | `number?`  | Unix epoch in milliseconds                        |
| `tag`       | `string?`  | Deduplication tag                                 |
| `data`      | `object?`  | Structured metadata (see `data.type` for routing) |

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

| Option    | Type                                  | Required | Description            |
| --------- | ------------------------------------- | -------- | ---------------------- |
| `cookies` | `{ auth_token: string; ct0: string }` | Yes      | Session cookies        |
| `state`   | `ClientState`                         | No       | Restore previous state |

### Events

| Event          | Payload               | Description                    |
| -------------- | --------------------- | ------------------------------ |
| `notification` | `TwitterNotification` | Decrypted notification         |
| `connected`    | `ClientState`         | Connected — persist this state |
| `error`        | `Error`               | Error (connection continues)   |
| `disconnected` | —                     | WebSocket closed               |
| `reconnecting` | `number`              | Reconnecting in N ms           |

### Methods

- **`client.start()`** — Connect and begin receiving notifications
- **`client.stop()`** — Disconnect

### Low-level Exports

- `Decryptor` — AESGCM Web Push decryption (ECDH + HKDF + AES-128-GCM)
- `AutopushClient` — Mozilla Autopush WebSocket client

## How It Works

```mermaid
sequenceDiagram
    participant App as xnotif
    participant Autopush as Mozilla Autopush<br/>wss://push.services.mozilla.com
    participant Twitter as Twitter/X

    App->>App: Generate ECDH P-256 key pair + 16-byte auth secret
    App->>Autopush: WebSocket connect (subprotocol: push-notification)
    Autopush-->>App: hello ACK (uaid assigned)
    App->>Autopush: Register channel with VAPID key
    Autopush-->>App: Push Endpoint URL

    App->>Twitter: POST /1.1/notifications/settings/login.json<br/>{ token: endpoint, encryption_key1: p256dh, encryption_key2: auth }
    Twitter-->>App: 200 OK

    loop Real-time notifications
        Twitter->>Autopush: Web Push (AESGCM encrypted payload)
        Autopush->>App: WebSocket message
        App->>App: ECDH shared secret (256-bit)<br/>→ HKDF-SHA256 (IKM, CEK, nonce)<br/>→ AES-128-GCM decrypt<br/>→ Strip 2-byte padding
        App-->>App: Emit "notification" event
    end
```

1. **Key generation** — Generate an ECDH P-256 key pair and a 16-byte auth secret via `crypto.subtle` (skipped when restoring from saved `state`)
2. **Autopush connection** — Open a WebSocket to `wss://push.services.mozilla.com` with the `push-notification` subprotocol, send a `hello` handshake, then register a channel to obtain a Push Endpoint URL
3. **Twitter registration** — POST the Push Endpoint, base64url-encoded public key, and auth secret to Twitter's `/1.1/notifications/settings/login.json`, authenticated with your session cookies (`auth_token` / `ct0`)
4. **Receive & decrypt** — When Twitter pushes an AESGCM-encrypted payload through Autopush, derive a shared secret via ECDH, expand it with HKDF-SHA256 into a 16-byte CEK and 12-byte nonce, then decrypt with AES-128-GCM
5. **Emit** — Parse the decrypted JSON into a `TwitterNotification` and fire it as a `notification` event

## License

MIT
