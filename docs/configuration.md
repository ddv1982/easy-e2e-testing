# Configuration

Create `ui-test.config.yaml` in project root.

## Full Example

```yaml
testDir: e2e
baseUrl: http://127.0.0.1:5173
startCommand: ui-test example-app --host 127.0.0.1 --port 5173 || npx -y github:ddv1982/easy-e2e-testing example-app --host 127.0.0.1 --port 5173
improveApplyMode: review
improveApplyAssertions: false
improveAssertionSource: snapshot-native
improveAssertionApplyPolicy: reliable
improveAssertions: candidates
```

## Fields

### Project Settings
- `testDir`: directory to discover YAML tests.
- `baseUrl`: base URL used for relative navigations.
- `startCommand`: app startup command used by `play` auto-start.

### Improve Defaults
- `improveApplyMode`: `review` or `apply`. Controls selector auto-apply. Note: CLI `--apply` enables both selectors and assertions; config keys control each independently.
- `improveApplyAssertions`: apply high-confidence assertion candidates when improve runs.
- `improveAssertionSource`: `snapshot-native` (default, native aria snapshot mode), `deterministic` (form-state only), or `snapshot-cli` (external Playwright-CLI snapshot mode).
- `improveAssertionApplyPolicy`: `reliable` (default) or `aggressive`.
  - `reliable`: snapshot-derived `assertVisible` is report-only.
  - `aggressive`: snapshot-derived `assertVisible` can be auto-applied after runtime validation.
- `improveAssertions`: `none` or `candidates`.
- `improveProvider`: removed; if present in config, improve will raise a migration error.
- `llm`: removed; if present in config, improve will raise a migration error.

## Runtime Defaults (Flags-First)

Runtime behavior is not configured in `ui-test.config.yaml`.

Built-in defaults:
- `play`: `headed=false`, `timeout=10000`, `delay=0`, `waitForNetworkIdle=true`, `saveFailureArtifacts=true`, `artifactsDir=.ui-test-artifacts`.
- Network-idle wait uses Playwright default timeout behavior (no custom timeout value is set by `ui-test`).
- `record`: `browser=chromium`, `selectorPolicy=reliable`.

Override per run with CLI flags.

Deprecated runtime config keys (for example `headed`, `timeout`, `delay`, `waitForNetworkIdle`, `networkIdleTimeout`, and `record*` runtime keys) are silently ignored.

## Command Overrides

Examples:

```bash
ui-test play --headed --timeout 15000
ui-test play --delay 250 --no-wait-network-idle
ui-test play --save-failure-artifacts
ui-test play --artifacts-dir ./tmp/ui-test-artifacts --no-save-failure-artifacts
ui-test record --browser firefox --selector-policy raw
ui-test improve e2e/login.yaml --apply
ui-test improve e2e/login.yaml --apply-selectors
ui-test improve e2e/login.yaml --apply-assertions
ui-test improve e2e/login.yaml --apply --assertion-source snapshot-native
ui-test improve e2e/login.yaml --apply --assertion-source snapshot-cli
ui-test improve e2e/login.yaml --apply --assertion-apply-policy aggressive
ui-test doctor
```

## V2 YAML Step Contract

Selector-based actions use `target`:

```yaml
- action: click
  target:
    value: "getByRole('button', { name: 'Save' })"
    kind: locatorExpression
    source: manual
```

Supported `target.kind`:
- `locatorExpression`
- `playwrightSelector`
- `css`
- `xpath`
- `internal`
- `unknown`
