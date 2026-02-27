# Workspace Setup

## Summary

bun workspace で monorepo 化し、ライブラリ本体を `packages/core/` に移動、`examples/cli/` に元の CLI 動作を再現するサンプルを配置する。

## Background & Purpose

ライブラリ化 (#2) で CLI を削除したが、元の CLI 動作 (init + start でコンソール出力 + JSON 保存) はライブラリの使い方のリファレンスとして価値がある。monorepo 構成にすることで、ライブラリ本体とサンプルを同一リポジトリで管理し、API 変更時にサンプルも同時に更新できる。

## Why Now

- ライブラリ化が完了した直後で、構造変更のコストが最小
- npm publish 前にパッケージ配置を確定させる必要がある
- examples がないと利用者が使い方を把握しにくい

## Hypothesis

- If we provide a working CLI example using the library API, then new users can understand the library's usage pattern within minutes
- If we use monorepo structure, then examples always stay in sync with the library API

## Expected Outcome

- `packages/core/` にライブラリ本体、`examples/cli/` にサンプルが配置される
- `bun install` で workspace 全体の依存が解決される
- `bun run --cwd examples/cli start` で元の CLI と同等の動作が確認できる
