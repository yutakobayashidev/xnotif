# Implementation Plan: Vitest Test Infrastructure

Epic: #15 | Feature Spec: docs/specs/testing/vitest-setup/

## Dependency Graph

```
Phase 1: [#1 Vitest setup]
              ↓
Phase 2: [#2 utils] [#3 decrypt] [#4 autopush] [#5 twitter]
              ↓          ↓            ↓             ↓
Phase 3:          [#6 client]  [#7 integration]
              ↓
Phase 4: [#8 CI + coverage]
```

Parallel: #2/#3/#4/#5 (all depend only on #1), #6/#7 (depend on Phase 2)

## Tasks

- [x] #1 Set up Vitest with coverage in packages/core
  What: Install vitest + @vitest/coverage-v8, create vitest.config.ts with coverage thresholds (lines: 80, branches: 70, functions: 80, statements: 80), add test scripts to packages/core/package.json and root package.json
  Where: packages/core/vitest.config.ts, packages/core/package.json, package.json
  How: `bun add -d vitest @vitest/coverage-v8` in packages/core. Config with coverage.provider = "v8", coverage.thresholds, include src/**/*.test.ts. Root script: `bun run --cwd packages/core vitest run`
  Why: Foundation for all test tasks. Must exist before any test file can run.
  Verify: `bun run test` exits with "No test files found" (not an error about missing config). `bunx vitest --version` shows installed version.
  Files: packages/core/vitest.config.ts (new), packages/core/package.json, package.json

- [x] #2 Write unit tests for utils.ts
  What: Test base64urlToBuffer, bufferToBase64url round-trip; concatBuffers with 0, 1, multiple buffers; edge cases (empty string, padding variations, binary data)
  Where: packages/core/src/utils.test.ts (new)
  How: Import functions directly, use expect().toEqual() for buffer comparisons. No mocks needed — all pure functions.
  Why: Simplest module, builds confidence in test setup. Utils are used by decrypt.ts so correctness is critical.
  Verify: `bunx vitest run src/utils.test.ts` passes. Coverage for utils.ts = 100%.
  Files: packages/core/src/utils.test.ts (new)
  Depends: #1

- [x] #3 Write unit tests for decrypt.ts
  What: Test Decryptor.create() key generation, JWK export/import round-trip (create → getJwk → create with saved JWK → same public key), AESGCM decrypt with crafted test vector (encrypt with known keys using real WebCrypto, then decrypt and verify plaintext). Test edge cases: malformed headers, empty payload.
  Where: packages/core/src/decrypt.test.ts (new)
  How: Use real Node.js WebCrypto (no mocking). Generate a test keypair, encrypt a known plaintext using WebPush AESGCM spec, then decrypt with Decryptor. For internal helpers (parseHeader, hkdf), test indirectly through decrypt().
  Why: Decryptor is the most complex module (210 LOC). Crypto bugs are silent and catastrophic. Real WebCrypto ensures algorithm correctness.
  Verify: `bunx vitest run src/decrypt.test.ts` passes. Coverage for decrypt.ts >= 80%.
  Files: packages/core/src/decrypt.test.ts (new)
  Depends: #1

- [x] #4 Write unit tests for autopush.ts
  What: Test AutopushClient message routing (hello → register → notification → ack), reconnection with exponential backoff (verify delay doubles, caps at 60s), state getters (uaid, endpoint, remoteBroadcasts), close() behavior. Mock WebSocket with vi.mock or manual stub.
  Where: packages/core/src/autopush.test.ts (new)
  How: Create a MockWebSocket class that extends EventTarget, simulating open/message/close/error events. Instantiate AutopushClient with mock, trigger message events with JSON fixtures for each messageType. Use vi.useFakeTimers() for reconnection delay testing.
  Why: WebSocket protocol handling is fragile. Reconnection logic must be verified with deterministic timers.
  Verify: `bunx vitest run src/autopush.test.ts` passes. Coverage for autopush.ts >= 80%.
  Files: packages/core/src/autopush.test.ts (new)
  Depends: #1

- [x] #5 Write unit tests for twitter.ts
  What: Test registerPush() request construction (correct endpoint, headers, body), success response handling, error response handling (non-200 throws). Mock twitter-openapi-typescript with vi.mock().
  Where: packages/core/src/twitter.test.ts (new)
  How: vi.mock("twitter-openapi-typescript") to return a mock client. Mock the internal NotificationApi.post() to capture request args and return controlled responses. Test createClient() calls TwitterOpenApi.getClientFromCookies().
  Why: Twitter API integration is the external boundary. Must verify request shape without hitting real API.
  Verify: `bunx vitest run src/twitter.test.ts` passes. Coverage for twitter.ts >= 80%.
  Files: packages/core/src/twitter.test.ts (new)
  Depends: #1

- [x] #6 Write unit tests for client.ts
  What: Test NotificationClient lifecycle: start() creates Decryptor + AutopushClient + registers push, stop() closes connection, event emission (notification, connected, error, disconnected, reconnecting), state comparison logic (new endpoint triggers registerPush, same endpoint skips it).
  Where: packages/core/src/client.test.ts (new)
  How: vi.mock("./decrypt"), vi.mock("./autopush"), vi.mock("./twitter") to isolate orchestration logic. Verify event emissions with client.on() + Promise wrappers.
  Why: Client is the public API surface. Orchestration bugs (wrong order, missing error handling) must be caught.
  Verify: `bunx vitest run src/client.test.ts` passes. Coverage for client.ts >= 80%.
  Files: packages/core/src/client.test.ts (new)
  Depends: #1, #3, #4, #5

- [x] #7 Write integration test for notification pipeline
  What: Test full flow: createClient() → start() → receive notification → decrypt → emit "notification" event. All external deps mocked but internal module wiring is real.
  Where: packages/core/src/integration.test.ts (new)
  How: Mock only WebSocket and twitter-openapi (external boundaries). Let Decryptor use real WebCrypto, let AutopushClient wire to mock WebSocket, let client orchestrate. Simulate: WebSocket open → hello response → register response → notification message → verify decrypted event emitted.
  Why: Validates that modules work together correctly. Catches interface mismatches between modules.
  Verify: `bunx vitest run src/integration.test.ts` passes.
  Files: packages/core/src/integration.test.ts (new)
  Depends: #1, #3, #4, #5

- [x] #8 Update CI workflow and verify coverage thresholds
  What: Add `bun run test` step to .github/workflows/ci.yml between tsc --noEmit and lint. Verify coverage thresholds are enforced (vitest exits non-zero if below threshold).
  Where: .github/workflows/ci.yml
  How: Add `- run: bun run test` step. Coverage text reporter is default in vitest — will print to CI logs. Thresholds already configured in vitest.config.ts from #1.
  Why: Tests must gate every push/PR. Coverage thresholds prevent regression.
  Verify: CI passes with all tests green and coverage report visible in logs.
  Files: .github/workflows/ci.yml
  Depends: #2, #3, #4, #5, #6, #7

## Task: README Value Proposition Update (2026-02-28)

- [x] #1 Add a "Why xnotif" section to README
  What: Add concise reasons to adopt xnotif with risk/ops context
  Where: packages/core/README.md
  Why: Clarify practical advantages for users evaluating this library
  Verify: Section exists and claims align with implementation (single registration API + push receive path)

- [x] #2 Emphasize cookie-minimizing operation
  What: Document that cookies are mainly needed for registration and not continuous polling
  Where: packages/core/README.md
  Why: Communicate lower operational/security burden and reduced ban-risk profile vs polling/scraping
  Verify: README explicitly states one-time registration pattern and state persistence behavior

- [x] #3 Review docs impact
  What: Confirm whether README/AGENTS/CLAUDE/docs need additional updates
  Where: repository docs
  Why: Keep documentation consistency
  Verify: Note decision in review section

### Review (README Value Proposition Update)

- Result: Added `## Why xnotif` section with cookie-minimizing operation, lower ban-risk profile vs polling/scraping, state-based re-registration skip, and operational simplicity.
- Verification: Claims were matched against implementation in `packages/core/src/client.ts` and `packages/core/src/twitter.ts`.
- Doc impact check:
  - `README.md`/`packages/core/README.md`: Updated.
  - `AGENTS.md`: No change needed (no agent instruction change in this task).
  - `CLAUDE.md`: No change needed (no Claude instruction change in this task).
  - `docs/`: No change needed (feature/architecture behavior unchanged).
