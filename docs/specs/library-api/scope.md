# Scope: Library API

## In Scope

- `NotificationClient` クラス (EventEmitter ベース)
  - `notification` イベント: 復号済み TwitterNotification を配信
  - `connected` イベント: 接続完了時に ClientState を返す
  - `error` イベント: エラー通知
  - `disconnected` イベント: 切断通知
  - `start()`: 接続開始 (state なしなら鍵生成 + Twitter 登録を自動実行)
  - `stop()`: 切断
- `createClient(options)` ファクトリ関数
- `ClientState` 型 (シリアライズ可能な状態オブジェクト)
- バレルエクスポート (`src/index.ts`)
  - 高レベル: `createClient`, `NotificationClient`
  - 型: `TwitterNotification`, `ClientState`, `NotificationClientOptions`
  - 低レベル: `Decryptor`, `AutopushClient` (パワーユーザー向け)
- CLI コード (`init` / `start` サブコマンド) の除去
- Bun 固有 API (`Bun.file`, `Bun.write`) の除去
  - `config.ts` → 削除 (状態管理はユーザー側)
  - `handlers.ts` → 削除 (ConsoleHandler / FileHandler は不要)
- `package.json` 更新: `private` 削除, `exports`, `types`, `files` 追加
- `tsconfig.json` 更新: `declaration: true`, `outDir: "dist"`
- `twitter.ts` の `console.log` 除去 (ライブラリはログを吐かない)
- README.md をライブラリ用途に書き換え

## Out of Scope

- npm publish の CI/CD パイプライン (→ `npm-publish` エピック)
- 通知フィルタリング機能
- Webhook アダプタ
- 複数アカウント対応
- Node.js / Deno 互換テスト
- テストスイート

## Success Criteria (KPI)

### Expected to Improve

- ライブラリとしての利用可能性: 0 → 1 (import して使える)
- セットアップコード行数: 10 行以内で通知受信開始
- 型カバレッジ: 全公開 API に型定義あり

### At Risk (may decrease)

- CLI としての直接利用 (削除されるため)

## Acceptance Gates

- [ ] `import { createClient } from "reverse-twitter-notifications"` が動作する
- [ ] `client.on("notification", cb)` で通知を受信できる
- [ ] `client.on("connected", cb)` で ClientState を取得できる
- [ ] ClientState を保存→復元して再接続できる
- [ ] `bun run build` で dist/ が生成される
- [ ] `Bun.file` / `Bun.write` がライブラリコードに存在しない
- [ ] `console.log` がライブラリコードに存在しない (error のみ許容しない)

## Experiment Info (if applicable)

N/A — 構造変更のため実験なし
