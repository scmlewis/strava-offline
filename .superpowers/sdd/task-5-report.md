# Task 5: Add lint and format check to CI

## Status: DONE

## Changes
- Modified `.github/workflows/deploy.yml` to add quality gate steps (`format:check`, `lint`, `typecheck`, `test`) before the build step
- These steps run on every push to `main` and on `workflow_dispatch`, failing the pipeline early if any check fails

## Commits
- `a12d9c1` — ci: add lint, format, typecheck, and test steps before build

## Test Summary
- Added 4 CI quality gates; no local tests run for this change

## Concerns
- None
