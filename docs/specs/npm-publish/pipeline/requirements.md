# Requirements: npm publish pipeline

## Functional Requirements

### P1 (Must have)

- パッケージ名を `xnotif` に変更し、npm レジストリから `bun add xnotif@beta` でインストールできる
- changesets で PR 単位のバージョン変更を管理できる
  - pre-release mode で `0.1.0-beta.x` としてバージョニングする
  - main マージ時に Version PR が自動作成される
  - Version PR マージ時に npm publish が `beta` dist-tag で実行される
- GitHub Actions CI が PR で自動実行される
  - build (`bun run build`)
  - type-check (`tsc --noEmit`)
  - lint (`oxlint`)
- `packages/core/package.json` に npm メタデータが英語で設定されている
  - description, keywords, repository, homepage, bugs, author, license

### P2 (Should have)

- oxfmt による format check が CI に含まれる
- changeset bot が PR にバージョン変更の有無をコメントする
- CHANGELOG.md が changesets release 時に自動生成される

### P3 (Nice to have)

- `oxfmt --migrate prettier` 相当の設定（将来の Prettier 移行パスが不要になる）

## Non-Functional Requirements

- CI は 1 分以内に完了する（oxlint + oxfmt は Rust 製で高速）
- NPM_TOKEN は GitHub Secrets で管理し、ワークフロー外に露出しない
- monorepo 構成で `packages/core` のみ publish 対象（root と examples は private）

## Edge Cases

1. changeset なしの PR（docs のみ等）→ changeset bot が警告するが CI は通る
2. pre-release mode 中に breaking change → minor bump（0.x なので patch でも可）
3. npm publish 失敗（token 期限切れ等）→ ワークフローが失敗し、再実行で復旧可能
4. パッケージ名変更時、workspace:* 参照の examples/cli が壊れないこと

## Constraints

- ランタイム: Bun (CI でも bun を使用)
- Linter: oxlint（Biome ではなく OXC ツールチェイン）
- Formatter: oxfmt beta
- バージョン管理: changesets pre-release mode
- 初回バージョン: 0.1.0-beta.0
