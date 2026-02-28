# Scope: Notification Filter

## In Scope

- `NotificationClientOptions` に `filter` オプションを追加
  - predicate 関数: `(notification: TwitterNotification) => boolean`
- `client.ts` の `onNotification` 内で filter を評価し、false なら `emit` をスキップ
- ユニットテスト（filter あり/なし/各パターン）
- README にフィルタリングのドキュメント追加

## Out of Scope

- 宣言的フィルタ（`{ types: ["tweet"] }` 等）— type の全容が不明なため時期尚早
- `filtered` イベントの追加（除外された通知のデバッグイベント）
- 通知カテゴリの分類ロジック（feed-app 側の責務）
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
- [ ] テストカバレッジが既存閾値（lines 80%, branches 70%, functions 80%）を維持
- [ ] README に使用例が記載されている

## Experiment Info (if applicable)

- 該当なし（フィーチャーフラグ不要。オプショナルな additive change）
