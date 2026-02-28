# Scope: Testing Infrastructure

## In Scope

- Vitest setup in packages/core with config
- Unit tests for Decryptor (AESGCM decrypt with known test vectors)
- Unit tests for AutopushClient (WebSocket message handling, reconnection logic)
- Unit tests for Twitter registration module (request construction, response parsing)
- Unit tests for utility functions (generateKeys, base64url encoding)
- Integration test: full notification pipeline (register -> connect -> receive -> decrypt -> emit)
- Vitest coverage reporter (v8 or istanbul)
- CI workflow update: add test step before build
- Root-level `test` script in package.json

## Out of Scope

- E2E tests with real Twitter credentials (requires secrets, manual only)
- Snapshot testing for notification payloads (payloads vary)
- Visual / UI testing (no UI)
- Performance benchmarks
- Tests for examples/cli (private, not published)

## Success Criteria (KPI)

### Expected to Improve

- Line coverage: 0% -> 80%+
- Branch coverage: 0% -> 70%+
- Regression detection: manual -> automated

### At Risk (may decrease)

- CI duration: ~10s -> ~20-30s (acceptable tradeoff)
- devDependency count: +2-3 packages (vitest, @vitest/coverage-v8)

## Acceptance Gates

- [ ] `bun run test` passes locally
- [ ] CI runs tests on push and PR
- [ ] Coverage >= 80% lines
- [ ] Decryptor tested with known AESGCM test vectors
- [ ] Integration test covers register -> connect -> decrypt -> emit flow (mocked)
- [ ] No test requires real Twitter credentials or network access
