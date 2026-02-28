# Design: Vitest Test Infrastructure

## Current State

- packages/core has zero test coverage
- No test runner, config, or test files exist
- CI workflow (ci.yml) runs build, type-check, lint, format-check — no tests
- Source modules have clear separation: decrypt.ts (crypto), autopush.ts (WebSocket), twitter.ts (API), client.ts (orchestration), utils.ts (pure helpers)

## Proposed Changes

### Test Configuration

- Add `vitest.config.ts` in packages/core with coverage thresholds
- Add vitest + @vitest/coverage-v8 as devDependencies in packages/core
- Add `test` script to packages/core/package.json
- Add root-level `test` script to run tests from workspace root

### Test File Structure

Colocated with source files:

```
packages/core/src/
├── utils.ts
├── utils.test.ts
├── decrypt.ts
├── decrypt.test.ts
├── autopush.ts
├── autopush.test.ts
├── twitter.ts
├── twitter.test.ts
├── client.ts
├── client.test.ts
└── integration.test.ts
```

### Mocking Strategy

| Module | External Dependency | Mock Approach |
|--------|-------------------|---------------|
| decrypt.ts | crypto.subtle | Use real Node.js WebCrypto (available in Node 22) — no mocking needed for crypto |
| autopush.ts | WebSocket | vi.mock() with manual WebSocket stub emitting messages |
| twitter.ts | twitter-openapi-typescript | vi.mock() the library's client factory and API methods |
| client.ts | AutopushClient, Decryptor, twitter | vi.mock() each module to isolate orchestration logic |

### Test Vectors

- Decryptor: Use RFC 8188 test vectors for AESGCM decryption + craft custom vectors from a known keypair
- AutopushClient: JSON message fixtures for each messageType (hello, register, notification)
- Twitter: Mock HTTP response fixtures (200 success, 403 forbidden, 500 error)

### CI Integration

- Add `bun run test` step to `.github/workflows/ci.yml` between type-check and lint
- Coverage text report printed in CI logs
- Threshold enforcement: CI fails if coverage drops below lines: 80%, branches: 70%

### Coverage Thresholds

```
lines: 80
branches: 70
functions: 80
statements: 80
```

## Tracking

| Event Name | Properties | Trigger Condition |
|------------|------------|-------------------|
| N/A — no analytics tracking needed for test infrastructure | | |
