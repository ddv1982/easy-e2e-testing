# Test Coverage Report

**Date:** 2026-02-21
**Scope:** Core runtime modules (`src/core/**`, `src/utils/**`)
**Note:** Values below are a snapshot and may change as tests evolve.

## Coverage Snapshot

Run `npm run test:coverage` to generate current coverage numbers.

Latest local run snapshot (`npm run test:coverage`):

- **Statements:** 80.64%
- **Branches:** 68.70%
- **Functions:** 92.99%
- **Lines:** 84.48%

## Coverage Thresholds

Current enforced thresholds from `vitest.config.ts`:

- **Lines:** 82%
- **Functions:** 90%
- **Branches:** 65%
- **Statements:** 80%

## Notes

- Unit tests cover parser, schema validation, and player helpers (`resolveLocator`, `resolveNavigateUrl`, `stepDescription`).
- Integration tests validate full `play()` execution with a real browser and dynamic localhost fixture server.
- Improve integration coverage includes a dynamic-news acceptance benchmark that asserts brittle exact headline locators are repaired and replay passes post-improve.
- Overlay resilience now includes Playwright locator-handler registration with targeted fallback dismissal coverage in runtime tests.
- Headed/headless parity is validated separately via `npm run test:parity:headed`.

## Coverage Exclusions

The following files are excluded from coverage requirements:
- `src/bin/**` - CLI entry point
- `src/core/contracts/**` - Contract-only interfaces
- `src/core/improve/improve.ts` - Re-export shim
- `src/core/play/play-types.ts` - Type-only declarations
- `src/utils/chromium-runtime.ts` - Environment-dependent launcher diagnostics
- `src/utils/ui.ts` - Display formatting utility

## Integration Harness Notes

- Integration tests use a dynamic localhost port (`127.0.0.1` with `listen(0)`) to avoid fixed-port conflicts.
- YAML fixtures are copied to temp files with runtime `baseUrl` injection for stability across environments.
