# Scope: npm-publish

## In Scope

- changesets 導入 (`.changeset/config.json`, GitHub Action)
- GitHub Actions CI ワークフロー: build + type-check + lint (Biome)
- changesets release ワークフロー: マージ時に自動 publish
- Biome 導入 (linter/formatter)
- `packages/core/package.json` に npm メタデータ追加 (description, keywords, repository, homepage, bugs — 英語)
- NPM_TOKEN シークレット設定手順のドキュメント

## Out of Scope

- テストスイート追加 (別 epic)
- README の英語翻訳
- Node.js / Deno 互換性対応
- 通知フィルタリング、Webhook 連携等の機能追加
- Provenance 署名 (将来検討)

## Success Criteria (KPI)

### Expected to Improve

- npm レジストリからインストール可能
- PR ごとにバージョン変更が追跡される (changeset bot)
- main マージ時に自動 publish される

### At Risk (may decrease)

- PR マージまでのリードタイム (changeset 追加ステップ分)

## Acceptance Gates

- [ ] `npm install reverse-twitter-notifications` が成功する
- [ ] CI (build + type-check + lint) が PR で自動実行される
- [ ] changesets の Version PR がマージ時に作成される
- [ ] Version PR マージで npm publish が自動実行される
- [ ] `packages/core/package.json` に description, keywords, repository が設定されている
