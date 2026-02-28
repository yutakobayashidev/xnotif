# Requirements: Vitest Test Infrastructure

## Functional Requirements

### P1 (Must have)

- Vitest configured in packages/core with coverage enabled (v8 provider)
- Test files colocated with source: `src/<module>.test.ts`
- Unit tests for `decrypt.ts`: AESGCM decryption with known test vectors, key generation, HKDF derivation, header parsing, nonce adjustment
- Unit tests for `autopush.ts`: WebSocket message routing (hello/register/notification/ack), reconnection with exponential backoff, state persistence (uaid, broadcasts)
- Unit tests for `twitter.ts`: push registration request construction, response parsing, error handling for non-200 responses
- Unit tests for `utils.ts`: base64url encode/decode round-trip, buffer concatenation, edge cases (empty input, padding variations)
- Integration test: full notification pipeline (register -> connect -> receive -> decrypt -> emit) with all external dependencies mocked
- Root-level `test` script: `bun run --cwd packages/core vitest run`
- CI workflow updated: test step runs before build, coverage reported
- Coverage thresholds enforced in vitest.config.ts: lines >= 80%, branches >= 70%

### P2 (Should have)

- Unit tests for `client.ts`: state comparison logic, event emission, start/stop lifecycle, error propagation
- Coverage report output in CI logs (text reporter)

### P3 (Nice to have)

- Vitest UI for local development (`vitest --ui`)

## Non-Functional Requirements

- All tests run without network access (WebSocket, HTTP, Twitter API fully mocked)
- No real Twitter credentials required in any test
- Test suite completes in < 10 seconds locally
- Vitest runs on Node.js (compatible with Web standard APIs: WebCrypto, WebSocket)

## Edge Cases

1. Decryptor receives malformed AESGCM headers (missing Crypto-Key or Encryption headers) — should throw descriptive error
2. AutopushClient receives unknown messageType — should not crash, log/ignore gracefully
3. AutopushClient WebSocket closes unexpectedly — should trigger reconnection with backoff
4. Twitter registerPush returns non-200 status — should throw with status info
5. base64url input with and without padding — should decode correctly either way
6. Empty notification payload — should handle without crashing

## Constraints

- Vitest as test runner (user decision)
- Coverage provider: v8 (fastest, native to Node.js)
- No additional test utility libraries unless strictly necessary (prefer Vitest built-in mocking)
- Tests must not be included in npm publish (already excluded by `files: ["dist", "README.md"]`)
