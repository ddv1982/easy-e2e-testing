# Troubleshooting

## Browser Installation Issues

### Chromium executable missing

Run:

```bash
npx playwright install chromium
```

### Linux shared dependencies missing

Run:

```bash
npx playwright install-deps chromium
```

## App Reachability Errors in `play`

If `play` cannot reach your app:
1. Verify `baseUrl` in `ui-test.config.yaml`.
2. Verify `startCommand` if auto-start is expected.
3. For manually started apps, run:

```bash
npx ui-test play --no-start
```

## Recorder Produces No Interactions

- Ensure you actually click/type/interact before closing recording session.
- Re-run recording and verify browser window is used.
- Check for fallback diagnostics in CLI output.

You can force fallback mode for debugging:

```bash
UI_TEST_DISABLE_JSONL=1 npx ui-test record
```

## Improve Apply Mode Fails

If you see runtime validation errors:
- install Chromium (`npx playwright install chromium`)
- run without `--apply` for report-only mode

## Local LLM Issues

If `--llm` fails:
1. Ensure Ollama is running.
2. Verify `llm.baseUrl` and `llm.model`.
3. Re-run without LLM:

```bash
npx ui-test improve e2e/login.yaml --no-llm
```

## Config Errors

### Legacy config filename detected

Only `ui-test.config.yaml` is supported.
Rename legacy files:
- `easy-e2e.config.yaml`
- `easy-e2e.config.yml`

## CI Runner Notes

For self-hosted runner fallback configuration, see [Maintainers](maintainers.md).
