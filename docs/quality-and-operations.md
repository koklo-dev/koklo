---
title: Quality and operations
audience: technical
doc_version: 0.1.0
status: draft
last_reviewed: 2026-10-26
covers_release: unreleased
sources: []
---
# Quality and operations

## Test strategy and evidence
TO DOCUMENT — test levels, what each level guarantees, how to run them.

## Quality gates
TO DOCUMENT — lint, types, coverage, dependency audit, security scan, and the
blocking/advisory status of each.

## Release and dependency automation (TK-6)

### Release Please
- Workflow: `.github/workflows/release-please.yml`, triggered on every push to `main`.
  It runs `googleapis/release-please-action@v5.0.0` with
  `release-please-config.json` and `.release-please-manifest.json`, then opens
  (and keeps up to date) a release PR built from Conventional Commits.
- Permissions: `contents: write`, `pull-requests: write`. `concurrency` group
  `release-please`, `cancel-in-progress: false` (runs queue, never cancel).
- Config (manifest mode): a single package `.` named `koklo`, `release-type: node`,
  changelog at `CHANGELOG.md`, `include-component-in-tag: false` (tags are plain
  `vX.Y.Z`). Current manifest version: `0.0.0`.
- Merging the release PR creates the tag and GitHub release; no further
  workflow step is defined in this change.
- Planned, not yet configured (ASSUMPTION, from the ticket): one shared version for
  `apps/*`, and independent versions for `cli`, `schema`, `contract`, to be added to
  `packages` once those packages exist.

### Dependabot
`.github/dependabot.yml` (version 2) runs weekly, max 5 open PRs per ecosystem:

| Ecosystem | Directory | Commit prefix | Notes |
|-----------|-----------|---------------|-------|
| `npm` | `/` | `chore` (with scope) | minor and patch updates grouped in `minor-and-patch` |
| `github-actions` | `/` | `ci` | |
| `docker` | `/apps/*` | `chore` | Dockerfiles are expected in `apps/*`; none verified present yet |

Prefixes keep Dependabot PRs valid for the `commitlint` workflow.

## Environments and runtime
TO DOCUMENT — environments, configuration and secrets handling, deployment
topology and rollback path.

## Observability
TO DOCUMENT — logs, metrics, traces, health checks, alerting.

## Risks, mitigations and runbook
TO DOCUMENT — known risks, their mitigations, and what to do at 3am.
