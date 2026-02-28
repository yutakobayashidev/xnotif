# Testing Infrastructure

## Summary

Add comprehensive test coverage to xnotif core library using Vitest, covering unit tests for each module, integration tests for the notification pipeline, and CI integration.

## Background & Purpose

xnotif core (~675 lines) has zero test coverage. The library handles cryptographic operations (ECDH, AESGCM), WebSocket communication (Autopush), and HTTP registration (Twitter API). These are high-risk areas where regressions silently break functionality. As the library enters beta and gains users, automated testing is essential for confident releases.

## Why Now

- Library just published as `0.1.1-beta.0` — users are starting to depend on it
- Changesets pipeline is in place, so tests can gate releases via CI
- Core API surface is stabilizing — good time to lock behavior with tests before adding new features
- Decryptor and Autopush modules use well-defined protocols with known test vectors

## Hypothesis

- If we add unit + integration tests with CI enforcement, then regressions in crypto/WebSocket/registration will be caught before npm publish
- If we use Vitest, then we get fast execution, native ESM support, and rich coverage reporting without fighting Bun/ESM compat issues

## Expected Outcome

- 80%+ line coverage on packages/core
- All tests run in CI on every push/PR
- Coverage report generated and accessible
- Developers can confidently refactor internals knowing tests catch breakage
