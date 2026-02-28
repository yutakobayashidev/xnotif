# Requirements: Predicate Filter

## Functional Requirements

### P1 (Must have)

- `NotificationClientOptions` に `filter?: (notification: TwitterNotification) => boolean` を追加する
- `filter` が `false` を返した通知は `notification` イベントを発火しない
- `filter` 未指定時は従来通りすべての通知を発火する（後方互換）
- `filter` が例外をスローした場合、`error` イベントを発火し、その通知は破棄する

### P2 (Should have)

- README に filter オプションの使用例を記載する

## Non-Functional Requirements

- filter は同期関数のみサポートする（async は型レベルで受け付けない）
- 既存テストカバレッジ閾値（lines 80%, branches 70%, functions 80%, statements 80%）を維持する

## Edge Cases

1. `filter` が常に `false` を返す — 通知は一切発火されない。error にもならない
2. `filter` が例外をスローする — `error` イベントを発火。通知は破棄。接続は維持
3. `filter` 未指定 — 全通知を発火（既存動作と同一）
4. 復号後の `TwitterNotification` に `data` フィールドがない — filter にはそのまま渡す。フィールド有無の判断は filter 側の責務

## Constraints

- `filter` は `createClient` 時に設定し、実行中の変更はサポートしない
- `filter` は復号後の `TwitterNotification` オブジェクトに対して評価する（暗号化ペイロードには触れない）
