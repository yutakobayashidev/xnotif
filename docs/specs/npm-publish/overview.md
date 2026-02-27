# npm-publish

## Summary

changesets ベースのバージョン管理と GitHub Actions CI/CD を整備し、`reverse-twitter-notifications` を npm レジストリに公開する。

## Background & Purpose

ライブラリ化 (library-api) と monorepo 化 (workspace-setup) は完了したが、npm レジストリに公開されておらず外部ユーザーが利用できない。`bun add reverse-twitter-notifications` で即座に使えるようにすることが、scope.md の Success Criteria (P1) に挙がっている。

## Why Now

コアライブラリと型定義は整備済み。公開のブロッカーは CI パイプラインと npm メタデータのみ。これを整備しないと後続の epic (notification-filter, webhook-adapter) でユーザーフィードバックが得られない。

## Hypothesis

- Hypothesis 1: changesets で PR 単位のバージョン管理を導入すれば、リリースの一貫性と changelog 自動生成を維持できる
- Hypothesis 2: CI に build + type-check + lint を組み込めば、壊れたパッケージの公開を防げる

## Expected Outcome

- `npm install reverse-twitter-notifications` でインストール可能
- PR ごとにバージョン変更が追跡され、マージ時に自動 publish
- CI で build / type-check / lint が通らないと publish されない
