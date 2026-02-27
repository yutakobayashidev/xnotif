# Design: NotificationClient

## Current State

CLI ツールとして動作。`src/index.ts` が `process.argv` でサブコマンドを分岐し、各モジュールを直接呼び出す。

```
src/
├── index.ts      ← CLI エントリポイント (init/start サブコマンド)
├── autopush.ts   ← Autopush WebSocket クライアント
├── decrypt.ts    ← AESGCM 復号
├── twitter.ts    ← Twitter push 登録
├── handlers.ts   ← ConsoleHandler / FileHandler / CallbackHandler
├── config.ts     ← config.json 読み書き (Bun.file 依存)
├── types.ts      ← 型定義
└── utils.ts      ← base64url / buffer ユーティリティ
```

I/O を持つモジュール: `config.ts` (Bun.file), `handlers.ts` (Bun.file, console.log)
CLI 固有: `index.ts` (process.argv, prompt)

## Proposed Changes

### ファイル構成

```
src/
├── index.ts      ← バレルエクスポート (公開 API)
├── client.ts     ← NotificationClient (新規)
├── autopush.ts   ← 変更なし (console.log 除去のみ)
├── decrypt.ts    ← 変更なし
├── twitter.ts    ← console.log 除去
├── types.ts      ← ClientState, NotificationClientOptions 追加
└── utils.ts      ← 変更なし
```

**削除するファイル:**

- `config.ts` — 状態管理はユーザー側の責務
- `handlers.ts` — ライブラリは handler パターンを使わない (EventEmitter で直接配信)

### 公開 API

```typescript
// src/index.ts (バレルエクスポート)
export { NotificationClient, createClient } from "./client";
export { Decryptor } from "./decrypt";
export { AutopushClient } from "./autopush";
export type {
  TwitterNotification,
  ClientState,
  NotificationClientOptions,
  AutopushNotification,
} from "./types";
```

### NotificationClient

```typescript
// src/client.ts
interface NotificationClientEvents {
  notification: (notification: TwitterNotification) => void;
  connected: (state: ClientState) => void;
  error: (error: Error) => void;
  disconnected: () => void;
  reconnecting: () => void;
}

class NotificationClient extends TypedEventEmitter<NotificationClientEvents> {
  start(): Promise<void>;
  stop(): void;
}

function createClient(options: NotificationClientOptions): NotificationClient;
```

### ClientState

```typescript
// Config から cookies を除外し、シリアライズ可能な形にしたもの
interface ClientState {
  uaid: string;
  channelId: string;
  endpoint: string;
  remoteBroadcasts: Record<string, string>;
  decryptor: {
    jwk: JsonWebKey;
    auth: string; // base64url
  };
}
```

### NotificationClientOptions

```typescript
interface NotificationClientOptions {
  cookies: { auth_token: string; ct0: string };
  state?: ClientState;
}
```

### package.json 変更

- `"private": true` → 削除
- `"exports"` 追加: `{ ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } }`
- `"files": ["dist"]`
- `"scripts.build"` 追加
- `"scripts.init"` / `"scripts.start"` 削除

### tsconfig.json 変更

- `"noEmit": true` → `"noEmit": false`
- `"declaration": true`, `"declarationMap": true` 追加
- `"outDir": "dist"` 追加

## Tracking

N/A — ライブラリのため計測イベントなし
