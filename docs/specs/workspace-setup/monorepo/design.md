# Design: Monorepo + CLI Example

## Current State

```
reverse-twitter-notifications/
├── package.json          ← ライブラリ本体 (name: reverse-twitter-notifications)
├── tsconfig.json
├── src/
│   ├── index.ts          ← バレルエクスポート
│   ├── client.ts         ← NotificationClient
│   ├── autopush.ts
│   ├── decrypt.ts
│   ├── twitter.ts
│   ├── types.ts
│   └── utils.ts
├── docs/
├── README.md
├── .gitignore
├── bun.lock
└── flake.nix
```

フラットなパッケージ構成。ライブラリ本体がルートに直置き。

## Proposed Changes

### ディレクトリ構成

```
reverse-twitter-notifications/
├── package.json              ← workspace root (private: true)
├── packages/
│   └── core/
│       ├── package.json      ← ライブラリ本体 (name: reverse-twitter-notifications)
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           ├── client.ts
│           ├── autopush.ts
│           ├── decrypt.ts
│           ├── twitter.ts
│           ├── types.ts
│           └── utils.ts
├── examples/
│   └── cli/
│       ├── package.json      ← workspace パッケージ (private: true)
│       ├── index.ts          ← CLI エントリポイント (init/start)
│       └── .gitignore        ← config.json, tweets.json を除外
├── docs/
├── README.md
├── .gitignore
├── bun.lock
└── flake.nix
```

### ルート package.json

- `name`: そのまま
- `private: true`
- `workspaces: ["packages/*", "examples/*"]`
- `scripts.build`: `bun run --cwd packages/core build`
- ライブラリ固有のフィールド (`exports`, `types`, `files`, `dependencies`, `devDependencies`) は `packages/core/package.json` に移管

### packages/core/package.json

- 現在の package.json からライブラリ固有のフィールドをそのまま継承
- `name: "reverse-twitter-notifications"` を維持 (npm publish 時のパッケージ名)

### examples/cli/package.json

- `name: "example-cli"`
- `private: true`
- `dependencies: { "reverse-twitter-notifications": "workspace:*" }`
- `scripts.init`: `bun run index.ts init`
- `scripts.start`: `bun run index.ts start`

### examples/cli/index.ts

元の `src/index.ts` (CLI 版) の動作をライブラリ API で再現:

- `init`: Cookie 入力 → `Decryptor.create()` で鍵生成 → ClientState + cookies を config.json に保存
- `start`: config.json 読み込み → `createClient({ cookies, state })` → `client.on("notification", ...)` でコンソール出力 + tweets.json 追記 → `client.on("connected", ...)` で state を config.json に更新

### 移動対象ファイル

| 移動元 | 移動先 |
|--------|--------|
| `src/` | `packages/core/src/` |
| `tsconfig.json` | `packages/core/tsconfig.json` |

### .gitignore 変更

- ルート .gitignore から `config.json`, `tweets.json` を削除 (examples/cli 固有のため)
- `examples/cli/.gitignore` に `config.json`, `tweets.json` を追加

## Tracking

N/A
