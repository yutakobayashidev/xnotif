# Requirements: NotificationClient

## Functional Requirements

### P1 (Must have)

- `createClient(options)` でクライアントインスタンスを生成できる
  - `options.cookies`: `{ auth_token: string, ct0: string }` — 必須
  - `options.state`: `ClientState` — 省略可。省略時は鍵生成 + Twitter 登録を自動実行
- `client.start()` で Autopush への接続を開始し、通知受信を開始する
  - state が渡されていれば既存の鍵/接続情報で復元接続
  - state がなければ ECDH 鍵生成 → Autopush 接続 → Twitter push 登録を一連で実行
- `client.stop()` で接続を切断する
- `client.on("notification", cb)` で復号済み `TwitterNotification` を受信できる
- `client.on("connected", cb)` で接続完了時に `ClientState` を受け取れる
  - `ClientState` はシリアライズ可能 (JSON.stringify/parse でラウンドトリップ可能)
  - 含むフィールド: `uaid`, `channelId`, `endpoint`, `remoteBroadcasts`, `decryptor` (JWK + auth)
  - cookies は含まない
- `client.on("error", cb)` でエラーを受け取れる
- `client.on("disconnected", cb)` で切断を検知できる
- 切断時は指数バックオフ (1s → 60s max) で自動再接続する
  - 再接続成功時にバックオフをリセット
  - 再接続時に `connected` イベントを再発行

### P2 (Should have)

- バレルエクスポートから低レベル API (`Decryptor`, `AutopushClient`) も利用できる
- `bun run build` で `dist/` に型定義付き JS を出力できる

### P3 (Nice to have)

- `client.on("reconnecting", cb)` で再接続試行を検知できる

## Non-Functional Requirements

- ライブラリコードに `console.log` / `console.error` を含まない
- ライブラリコードに `Bun.file` / `Bun.write` を含まない (Web 標準 API のみ)
- 全公開 API に TypeScript 型定義がある
- EventEmitter は型安全 (イベント名とコールバック型が対応)

## Edge Cases

1. **start() を複数回呼ぶ**: 既に接続中なら何もしない (二重接続しない)
2. **stop() 後に start()**: 再接続できる (使い捨てではない)
3. **Twitter 登録失敗**: error イベントを発行し、接続自体は維持 (Autopush は使える)
4. **復号失敗**: error イベントを発行し、接続は維持。次の通知は正常に処理される
5. **不正な state**: start() で検証し、不正なら新規生成にフォールバック
6. **cookies 未指定**: createClient() で即座にエラーをスローする

## Constraints

- ランタイム: 当面 Bun 対象 (Web 標準 API のみ使用するため将来的に Node/Deno 対応可能)
- 外部依存: `twitter-openapi-typescript` (Twitter 登録のみ)
- VAPID key はライブラリ内にハードコード (Twitter の公開鍵、変更頻度は極めて低い)
