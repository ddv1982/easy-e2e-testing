# Simplification Plan Status

This document tracks delivery status for the simplification effort.

## Status Table

| Item | Status | Notes |
| --- | --- | --- |
| Vue-first onboarding UX | Achieved | `init` defaults target local example app flow. |
| Runtime controls moved to flags-first | Achieved | Runtime settings are CLI flags with built-in defaults. |
| Remove `setup` command | Achieved | Onboarding is now `bootstrap` + `init` only. |
| Bootstrap modes cleanup | Achieved | Modes are `install`, `init`, `quickstart`. |
| Browser provisioning boundary | Achieved | Provisioning happens during onboarding, not runtime commands. |
| Strict config schema | Achieved | Unknown `ui-test.config.yaml` keys are validation errors. |
| Simplify `play` startup logic | Achieved | Keeps focused auto-start and reachability checks. |
| Add `--no-start` manual override | Achieved | Users can run against already-running apps. |
| Keep safe locator-expression support | Achieved | Allowlisted locator parsing remains in place. |
| CI coverage for onboarding flow | Achieved | Smoke path validates onboarding then `play`. |
