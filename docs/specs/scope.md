# Scope: reverse-twitter-notifications

## Current Phase

MVP → ライブラリ化 (CLI ツールからライブラリへの転換)

## In Scope (this phase)

- 高レベル API (`NotificationClient`) の設計・実装
- CLI コードの除去 (ライブラリのみ)
- npm パッケージとしての公開準備 (exports, types, build)
- 型定義の公開 (TwitterNotification, ClientState 等)
- 低レベル API のエクスポート (Decryptor, AutopushClient)
- Bun 依存 (`Bun.file`, `Bun.write`) の除去 — Web 標準 API に置換
- README のライブラリ利用ドキュメント

## Out of Scope (this phase)

- Webhook 連携
- 通知フィルタリング機能
- 複数アカウント同時接続
- Node.js / Deno での動作テスト (将来対応)
- テストスイートの追加

## Technical Constraints

- ランタイム: 当面 Bun 対象だが、コアは Web 標準 API (WebSocket, Web Crypto) のみ使用
- 外部依存: `twitter-openapi-typescript` (Twitter 登録用)
- TypeScript ESNext + ES Modules
- ビルド: `bun build` で dist を生成

## Success Criteria

- `npm install reverse-twitter-notifications` でインストールできる
- 10 行以内のコードで通知受信を開始できる
- 状態の保存・復元でプロセス再起動後も再接続できる
- 型定義が完備されている

## Recommended Epics

| Priority | Epic (slug) | One-line description | Why |
| -------- | ----------- | -------------------- | --- |
| P0 | `library-api` | CLI → ライブラリ化。EventEmitter ベースの NotificationClient を実装 | ライブラリ化の核 |
| P1 | `npm-publish` | npm 公開パイプライン (build, exports, CI) | 公開してユーザーが使えるようにする |
| P2 | `notification-filter` | 通知タイプ (tweet, like, follow 等) でのフィルタリング API | 不要な通知を無視できる |
| P2 | `webhook-adapter` | Webhook 送信アダプタ (Discord, Slack 等) | エコシステム拡張の第一歩 |
| P3 | `multi-account` | 複数アカウントの同時接続管理 | パワーユーザー向け |
