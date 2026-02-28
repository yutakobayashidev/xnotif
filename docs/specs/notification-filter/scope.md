# Scope: Notification Filter

## In Scope

- `NotificationClientOptions` に `filter` オプションを追加
  - predicate 関数: `(notification: TwitterNotification) => boolean`
  - 宣言的フィルタ: `{ types: string[] }` — `data.type` との一致で判定
  - union 型で両方を受け付ける
- `client.ts` の `onNotification` 内で filter を評価し、false なら `emit` をスキップ
- 宣言的フィルタを内部で predicate に変換するヘルパー
- 型定義の公開 (`NotificationFilter` 型)
- ユニットテスト（filter あり/なし/predicate/宣言的の各パターン）
- README にフィルタリングのドキュメント追加

## Out of Scope

- `filtered` イベントの追加（除外された通知のデバッグイベント）
- 通知カテゴリの分類ロジック（feed-app 側の責務）
- `data.type` 以外の宣言的フィルタ条件（ユーザー名、正規表現等）
- 実行時のフィルタ変更 API（`client.setFilter()`）
- Autopush / Twitter 登録レイヤーへのフィルタ条件伝播

## Success Criteria (KPI)

### Expected to Improve

- セットアップコードの簡潔さ: フィルタ付きでも10行以内を維持
- API の表現力: 1行で通知タイプフィルタを設定可能

### At Risk (may decrease)

- なし（additive change のため既存機能への影響なし）

## Acceptance Gates

- [ ] `filter` 未指定時の既存動作が変わらない（breaking change ゼロ）
- [ ] predicate 関数でフィルタリングが機能する
- [ ] `{ types: ["tweet"] }` で `data.type === "tweet"` の通知のみ受信できる
- [ ] テストカバレッジが既存閾値（lines 80%, branches 70%, functions 80%）を維持
- [ ] README に使用例が記載されている

## Experiment Info (if applicable)

- 該当なし（フィーチャーフラグ不要。オプショナルな additive change）
