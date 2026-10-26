---
title: Quality and operations
audience: technical
doc_version: 0.1.0
status: draft
last_reviewed: 2026-10-26
covers_release: unreleased
sources: []
covers_commit: 3c63a2c
---
# Quality and operations

## Test strategy and evidence
TO DOCUMENT — test levels, what each level guarantees, how to run them.

## Quality gates
The workflow `.github/workflows/ci.yml` (vision §16.3, §19.2) runs on every pull
request and on pushes to `develop` and `main`.

| Job | Required check | Runs when | What it does |
|-----|----------------|-----------|--------------|
| `changes` | no | always | Lists the changed files (`git diff origin/<base>...HEAD` on PR) and feeds them to `.github/scripts/detect-changes.sh`, which outputs `code`, `skills`, `ci`. On push, all three are `true`. |
| `ci` | **yes** (stable name) | always | Checks `.project/state.json`; then, only if `code=true` **and** a root `package.json` exists: install (`pnpm install --frozen-lockfile`), `pnpm lint`, typecheck, tests with coverage, coverage thresholds, build. |
| `skills in sync` | no | `skills=true` | `.github/scripts/skills-sync-gate.sh`: each `shipyard/skills/<name>.md` must match its published copy under `.claude/skills/` and `.codex/skills/`. |
| `ci scripts` | no | `ci=true` | Runs every `.github/scripts/*.test.sh` self-test (helpers in `lib-test.sh`). |

`ci` always runs (even when the heavy steps are skipped) so the required check
is always reported. A PR that touches no package therefore starts only
`changes` and `ci` (plus `skills in sync` / `ci scripts` if their files changed).

Path rules of `detect-changes.sh`:

| Output | Set to `true` by |
|--------|------------------|
| `code` | `apps/*`, `packages/*`, `scripts/*`, `.deploy/*`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json`, `biome.json`, `tsconfig*.json`, `.nvmrc`, `docker-compose.yml`, `.github/workflows/*` |
| `skills` | `shipyard/skills/*`, `.claude/skills/*`, `.codex/skills/*` |
| `ci` | anything under `.github/` (including workflows) |

On pull requests, typecheck, test and build run through
`pnpm exec turbo run <task> --affected` (`TURBO_ARGS`); on push they run on all
packages. Lint is `pnpm lint` in both cases.

### Coverage thresholds (blocking)
`.github/scripts/check-coverage.sh --require-reports .` reads the Vitest
`json-summary` reports `apps/*/coverage/coverage-summary.json` and
`packages/*/coverage/coverage-summary.json` (uploaded as the `coverage-summaries`
artifact, also on failure). It fails the job when:

- global lines coverage < 80 %;
- global branches coverage < 70 %;
- branches coverage < 90 % for `packages/domain` or `packages/delivery`;
- no report is found (`--require-reports`; without the flag, no report means
  "nothing to check", exit 0).

Exit code 2 signals a usage error (missing directory or `jq`). The "90 % on new
code" objective is **not** checked by this script (it would need a diff-cover).

### Coverage fixtures
`.github/fixtures/coverage/` holds sample reports (`ok`, `below`,
`below-domain`, `below-delivery`, `empty`) used by `check-coverage.test.sh` to
prove that a coverage drop fails the gate. Regenerate them with
`bash .github/scripts/gen-coverage-fixtures.sh`. `.gitignore` un-ignores
`coverage/` under `.github/fixtures/coverage/` so they can be committed.

### Pinned actions
`actions/checkout@v7.0.1`, `pnpm/action-setup@v6.1.0`, `actions/setup-node@v7.1.0`
(Node version from `.nvmrc`, pnpm cache), `actions/upload-artifact@v7.0.2`.

Not yet in this workflow: dependency audit and security scan.

## Environments and runtime
TO DOCUMENT — environments, configuration and secrets handling, deployment
topology and rollback path.

## Observability
TO DOCUMENT — logs, metrics, traces, health checks, alerting.

## Risks, mitigations and runbook
TO DOCUMENT — known risks, their mitigations, and what to do at 3am.
