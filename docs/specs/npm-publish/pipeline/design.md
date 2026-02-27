# Design: npm publish pipeline

## Current State

- パッケージ名: `reverse-twitter-notifications`（長い）
- バージョン: 0.1.0（npm 未公開）
- CI/CD: なし（`.github/workflows/` が存在しない）
- Linter/Formatter: なし
- changesets: 未導入

## Proposed Changes

### 1. パッケージ名変更

`reverse-twitter-notifications` → `xnotif`

変更箇所:
- `packages/core/package.json` の `name`
- `examples/cli/package.json` の `dependencies`
- `README.md` のインストールコマンド・パッケージ参照
- `examples/cli/index.ts` の import 文

### 2. npm メタデータ追加

`packages/core/package.json` に以下を追加:

| Field | Value |
|-------|-------|
| description | "Receive Twitter/X push notifications programmatically via Mozilla Autopush" |
| keywords | twitter, x, push, notifications, autopush, webpush |
| repository | `{ "type": "git", "url": "https://github.com/yutakobayashidev/reverse-twitter-notifications" }` |
| homepage | GitHub repo URL |
| bugs | GitHub issues URL |
| author | yutakobayashidev |
| license | MIT |

### 3. changesets 導入

- `@changesets/cli` をルート devDependency に追加
- `.changeset/config.json` を作成（access: public, baseBranch: main）
- pre-release mode を `beta` タグで開始

### 4. oxlint + oxfmt 導入

- `oxlint` と `oxfmt` をルート devDependency に追加
- ルートに設定ファイルを配置（必要に応じて）
- `package.json` scripts に `lint` と `format:check` を追加

### 5. GitHub Actions ワークフロー

#### CI ワークフロー (`.github/workflows/ci.yml`)

トリガー: push to main, pull_request

| Step | Command |
|------|---------|
| Install | `bun install --frozen-lockfile` |
| Build | `bun run build` |
| Type-check | `bun run --cwd packages/core tsc --noEmit` |
| Lint | `oxlint` |
| Format check | `oxfmt --check` |

#### Release ワークフロー (`.github/workflows/release.yml`)

トリガー: push to main

changesets/action を使用:
- changeset がある場合 → Version PR を作成/更新
- Version PR がマージされた場合 → npm publish (`--tag beta`)

NPM_TOKEN を GitHub Secrets に設定する必要がある。

## Tracking

| Event Name | Properties | Trigger Condition |
|------------|------------|-------------------|
| npm publish | version, tag | Version PR merge |
| CI pass | workflow, duration | PR / push to main |
| CI fail | workflow, step, error | Any step failure |
