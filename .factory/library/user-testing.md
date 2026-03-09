# User Testing

Testing surface: tools, URLs, setup steps, isolation notes, known quirks.

**What belongs here:** How to manually verify the application, testing tools available, known testing limitations.

---

## Testing Surface

This is a CLI library — no running web application. Validation is through automated quality gates:

- `npm run quality:ci` — full gate: lint + lint:typed + typecheck:prod + test
- `npm run test:coverage` — tests with V8 coverage reporting
- `npm run build` — production TypeScript compilation

## Verification Commands

| Command | Purpose |
|---------|---------|
| `npm run lint` | ESLint base config (zero warnings required) |
| `npm run lint:typed` | ESLint typed config with type-aware rules |
| `npm run typecheck:prod` | TypeScript production build check |
| `npm run typecheck:test` | TypeScript full check including tests |
| `npm test` | Vitest run (617+ tests) |
| `npm run test:coverage` | Vitest with coverage thresholds |
| `npm run build` | Full production build |

## Coverage Thresholds

Configured in `vitest.config.ts`:
- Lines >= 82%, Functions >= 90%, Branches >= 65%, Statements >= 80%
- Scope: `src/core/**` and `src/utils/**` only

## Known Quirks

- Architecture tests run as part of the normal test suite
- `tsconfig.build.json` is stricter than `tsconfig.json` (adds `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, etc.)
- Test files are excluded from build compilation but included in `tsconfig.json` check
- Coverage/test output can exceed terminal limits; for deterministic evidence, run coverage with `--coverage.reporter=json-summary` and parse `coverage-summary.json`.

## Flow Validator Guidance: terminal-cli

- Surface: terminal-only CLI validation (`npm` scripts), no browser/app session required.
- Isolation requirement: each flow validator must use a unique temp workspace namespace for artifacts/log output (for example `TMPDIR` subpaths like `user-testing-coverage-<group>`), and must not delete shared repo outputs.
- Shared-state boundaries: do not run concurrent validators that both execute `npm run test:coverage` unless each writes to isolated output paths; default to a single validator for coverage-heavy assertions to avoid race conditions.
- Allowed commands for this milestone: `npm test`, `npm run test:coverage`, and read-only inspection commands used to confirm module coverage lines and global thresholds.
- Off-limits actions: no changes to source files, package manifests, lockfiles, git history, or external services.
