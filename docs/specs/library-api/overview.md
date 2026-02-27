# Library API

## Summary

CLI ツールからライブラリへ転換し、EventEmitter ベースの `NotificationClient` を公開 API として提供する。

## Background & Purpose

現在の reverse-twitter-notifications は CLI ツール (`bun run src/index.ts start`) として動作し、プログラムから利用できない。Bot や自動化パイプラインに組み込むには、プログラマブルな API が必要。

コアロジック (Autopush 接続、AESGCM 復号、Twitter 登録) は既にモジュール分割されており、高レベル API を被せてエクスポートするだけでライブラリ化できる。

## Why Now

- npm 公開に向けた最初のステップ
- CLI 固有のコード (prompt, process.argv, Bun.file) がライブラリのコアに混入する前に分離すべき
- 既にコアモジュールが安定しており、API レイヤーを追加するタイミングとして最適

## Hypothesis

- If we provide an EventEmitter-based API, then developers can integrate Twitter notifications into their bots/pipelines in under 10 lines of code
- If we separate state management from the library, then users can persist state in any storage (file, DB, KV) without library-side I/O

## Expected Outcome

- `npm install reverse-twitter-notifications` でインストール可能
- EventEmitter API で通知をリアルタイム受信できる
- State オブジェクトの保存・復元で再起動後も再接続可能
- 型定義が完備され、エディタ補完が効く
