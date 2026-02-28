# Design: Predicate Filter

## Current State

`client.ts:62-75` の `onNotification` コールバック内で、復号した通知を無条件に `this.emit("notification", notification)` している。ユーザーはフィルタリングが必要な場合、イベントハンドラ内で自前の条件分岐を書く必要がある。

## Proposed Changes

### 型定義の追加 (`types.ts`)

`NotificationClientOptions` に `filter` フィールドを追加:

```typescript
filter?: (notification: TwitterNotification) => boolean;
```

### フィルタ評価の挿入 (`client.ts`)

`onNotification` コールバック内の `JSON.parse` 後、`this.emit("notification")` 前にフィルタを評価する。処理フロー:

1. 復号 → `JSON.parse` → `TwitterNotification` 取得（既存）
2. `this.options.filter` が存在する場合:
   - `filter(notification)` を呼び出す
   - 例外スロー時: `this.emit("error", err)` して return
   - `false` 返却時: return（emit しない）
3. `this.emit("notification", notification)`（既存）

### 公開 API への影響

- `NotificationClientOptions.filter` の追加（オプショナル。breaking change なし）
- 新しいイベント・メソッドの追加なし
- `index.ts` のエクスポート変更なし（`NotificationClientOptions` は既にエクスポート済み）

## Tracking

| Event Name | Properties | Trigger Condition                |
| ---------- | ---------- | -------------------------------- |
| 該当なし   |            | ライブラリのためトラッキング不要 |
