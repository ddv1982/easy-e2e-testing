# Improve Workflow

`improve` is a post-processing step for recorded YAML tests.

## Default (Review First)

```bash
npx ui-test improve e2e/login.yaml
```

This writes a JSON report and does not modify YAML.

## Apply Approved Changes

```bash
npx ui-test improve e2e/login.yaml --apply
```

Apply mode writes improved targets back to the same file.

## LLM-Optional Mode (Ollama)

```bash
npx ui-test improve e2e/login.yaml --llm
```

Disable explicitly per run:

```bash
npx ui-test improve e2e/login.yaml --no-llm
```

## Provider Selection

```bash
npx ui-test improve e2e/login.yaml --provider auto
npx ui-test improve e2e/login.yaml --provider playwright
npx ui-test improve e2e/login.yaml --provider playwright-cli
```

Behavior:
- `auto`: prefer `playwright-cli`, degrade to direct Playwright when unavailable.
- `playwright-cli`: best-effort CLI adapter; degrades safely.
- `playwright`: direct Playwright runtime only.

## Assertions Mode

```bash
npx ui-test improve e2e/login.yaml --assertions candidates
npx ui-test improve e2e/login.yaml --assertions none
```

Current scope:
- Assertions are reported as candidates.
- Assertions are not auto-inserted into YAML.

## Report Contents

The report includes:
- step-level old/recommended targets
- confidence deltas
- assertion candidates
- diagnostics and degradations

Default report path:
- `<test-file>.improve-report.json`

Custom path:

```bash
npx ui-test improve e2e/login.yaml --report ./reports/login.improve.json
```

## Runtime Safety Notes

- Apply mode requires runtime validation.
- Runtime analysis may replay actions; use a safe test environment.
- If browser runtime is unavailable, review mode can still run with static scoring fallback.
