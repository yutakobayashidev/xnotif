# reverse-twitter-notifications

Twitter(X) の Web Push 通知を Mozilla Autopush 経由で受信・復号し、プログラマブルな API として提供するライブラリ。Twitter API もスクレイピングも使わない。

## Install

```bash
bun add reverse-twitter-notifications
```

## Quick Start

```typescript
import { createClient } from "reverse-twitter-notifications";

const client = createClient({
  cookies: { auth_token: "YOUR_AUTH_TOKEN", ct0: "YOUR_CT0" },
});

client.on("notification", (notification) => {
  console.log(`${notification.title}: ${notification.body}`);
});

client.on("connected", (state) => {
  // state を保存して次回再利用
  await Bun.write("state.json", JSON.stringify(state));
});

await client.start();
```

## Cookie の取得

ブラウザで [x.com](https://x.com) にログインし、DevTools → Application → Cookies から以下を取得:

- `auth_token`
- `ct0`

## State の永続化

`connected` イベントで返される `ClientState` を保存することで、再起動後に再接続できます。

```typescript
import { readFileSync, existsSync } from "fs";
import { createClient, type ClientState } from "reverse-twitter-notifications";

const state: ClientState | undefined = existsSync("state.json")
  ? JSON.parse(readFileSync("state.json", "utf-8"))
  : undefined;

const client = createClient({
  cookies: { auth_token: "...", ct0: "..." },
  state,
});

client.on("connected", (newState) => {
  writeFileSync("state.json", JSON.stringify(newState));
});

await client.start();
```

## API

### `createClient(options): NotificationClient`

クライアントインスタンスを生成します。

**options:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cookies` | `{ auth_token: string; ct0: string }` | Yes | Twitter セッション Cookie |
| `state` | `ClientState` | No | 前回の接続状態。省略時は新規生成 |

### `client.start(): Promise<void>`

Autopush に接続し、通知受信を開始します。`state` が未指定の場合、ECDH 鍵生成と Twitter への push 登録を自動で行います。

### `client.stop(): void`

接続を切断します。

### Events

| Event | Callback | Description |
|-------|----------|-------------|
| `notification` | `(notification: TwitterNotification) => void` | 復号済み通知を受信 |
| `connected` | `(state: ClientState) => void` | 接続完了。state を永続化に利用 |
| `error` | `(error: Error) => void` | エラー発生 (接続は継続) |
| `disconnected` | `() => void` | 切断検知 |
| `reconnecting` | `(delay: number) => void` | 再接続試行 (delay ms 後) |

### Low-level API

パワーユーザー向けに低レベル API もエクスポートしています:

- `Decryptor` — AESGCM Web Push 復号 (ECDH + HKDF + AES-128-GCM)
- `AutopushClient` — Mozilla Autopush WebSocket クライアント

## 仕組み

```
Twitter → Mozilla Autopush (wss://push.services.mozilla.com/) → AESGCM 復号 → EventEmitter
```

自前の ECDH 鍵ペアを生成し、Twitter の push 通知エンドポイントに登録。通知は Autopush の WebSocket 経由で届き、ライブラリが復号して `notification` イベントで配信します。

## 参考

- [BANKA2017/twitter-monitor](https://github.com/BANKA2017/twitter-monitor/tree/node/apps/web_push)
