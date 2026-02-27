# Requirements: Monorepo + CLI Example

## Functional Requirements

### P1 (Must have)

- ルート package.json が bun workspace root として機能する
  - `workspaces: ["packages/*", "examples/*"]`
- `packages/core/` にライブラリ本体が配置される
  - 現在の `src/`, `tsconfig.json`, ライブラリ用 `package.json` をそのまま移動
  - `bun run --cwd packages/core build` でビルドが成功する
- `examples/cli/` に元の CLI 動作を再現するサンプルが配置される
  - `init` サブコマンド: Cookie 入力 → ECDH 鍵生成 → `examples/cli/config.json` に保存
  - `start` サブコマンド: config.json 読み込み → 通知受信 → コンソール出力 + `examples/cli/tweets.json` に保存
  - ライブラリの `createClient` / `NotificationClient` API を使って実装
- `bun install` でルートから workspace 全体の依存が解決される
- `examples/cli` から `reverse-twitter-notifications` をパッケージ名で import できる

### P2 (Should have)

- ルート package.json に workspace 全体のスクリプト (例: `build` で全パッケージビルド)
- README.md にリポジトリ構成と examples の実行方法を記載

### P3 (Nice to have)

- `examples/cli/` に個別の README.md

## Non-Functional Requirements

- ルートの `src/` ディレクトリが存在しない (packages/core/ に完全移動)
- examples/cli のファイル (config.json, tweets.json) が .gitignore に含まれる

## Edge Cases

1. `bun install` 前に `bun run --cwd examples/cli start` を実行 → 依存解決エラー
2. `packages/core` の API を変更した場合 → examples/cli も同時に更新が必要
3. ルートで `bun run build` → packages/core のビルドが走る

## Constraints

- bun workspace のネイティブ機能のみ使用 (turborepo 等の追加ツールなし)
- examples/cli は Bun 依存 OK (Bun.file, Bun.write, prompt 等を使用)
