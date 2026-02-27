# reverse-twitter-notifications

Twitter(X) の Web Push 通知を Mozilla Autopush 経由で受信し、API やスクレイピングなしでツイートをリアルタイム収集するツール。

## 仕組み

```
Twitter → Mozilla Autopush (wss://push.services.mozilla.com/) → 復号 → コンソール / JSON 保存
```

Twitter の Web Push 通知を、自前の ECDH 鍵ペアで受信・復号する。Twitter API も Web スクレイピングも使わない。

## セットアップ

### 1. Cookie の取得

ブラウザで [x.com](https://x.com) にログインし、DevTools → Application → Cookies から以下を取得:

- `auth_token`
- `ct0`

### 2. 初期化

```bash
bun run src/index.ts init
```

プロンプトで `auth_token` と `ct0` を入力。`config.json` が生成される。

### 3. 開始

```bash
bun run src/index.ts start
```

通知はコンソールに表示され、`tweets.json` にも保存される。

## 出力例

```
[2026-02-27T10:00:00.000Z] [tweet] @username: ツイート内容
  -> https://x.com/username/status/123456789
```

## アーキテクチャ

| モジュール | 役割 |
|---|---|
| `autopush.ts` | Mozilla Autopush WebSocket クライアント (接続・登録・再接続) |
| `decrypt.ts` | AESGCM Web Push 復号 (ECDH + HKDF + AES-128-GCM) |
| `twitter.ts` | Twitter push 登録 (`login.json`) + 2時間ごとの `checkin.json` |
| `handlers.ts` | 出力ハンドラ (コンソール / JSON ファイル / コールバック) |
| `config.ts` | `config.json` 永続化 |

## 依存関係

外部依存ゼロ。Bun の組み込み API (WebSocket, Web Crypto, fetch) のみ使用。

## 参考

- [BANKA2017/twitter-monitor](https://github.com/BANKA2017/twitter-monitor/tree/node/apps/web_push)
