# Scope: Workspace Setup

## In Scope

- ルート package.json を workspace root に変更 (`workspaces: ["packages/*", "examples/*"]`)
- `src/`, `tsconfig.json` を `packages/core/` に移動
- `packages/core/package.json` にライブラリ設定を移管
- `examples/cli/` に CLI サンプルを作成
  - 元の `init` / `start` サブコマンドの動作をライブラリ API で再現
  - コンソール出力 + JSON ファイル保存 + config.json 永続化
- `bun install` で workspace 依存解決が動作する
- README.md に monorepo 構成の説明を追加

## Out of Scope

- npm publish パイプライン
- 追加のサンプル (basic, file-logger 等)
- CI/CD 設定
- テストスイート

## Success Criteria (KPI)

### Expected to Improve

- 開発体験: ライブラリとサンプルを同一リポジトリで管理
- ドキュメント性: examples/cli が実動するリファレンス実装として機能

### At Risk (may decrease)

- リポジトリの初期理解コスト (ディレクトリ構造が深くなる)

## Acceptance Gates

- [ ] `bun install` が workspace 全体で成功する
- [ ] `bun run --cwd packages/core build` でライブラリがビルドできる
- [ ] `examples/cli` から `reverse-twitter-notifications` を import できる
- [ ] `bun run --cwd examples/cli start` で通知受信が動作する (元 CLI と同等)
- [ ] ルートの `src/` が存在しない (packages/core/ に移動済み)

## Experiment Info (if applicable)

N/A
