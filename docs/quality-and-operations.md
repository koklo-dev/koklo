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
Two GitHub Actions workflows were added by TK-5 (CDC §10.2, §17.3, §22 point 8).
Lint, types and coverage gates: TO DOCUMENT.

| Gate | Workflow / job | Triggers | Blocking |
|------|----------------|----------|----------|
| Trivy — repository scan | `.github/workflows/security.yml` / `trivy` | `pull_request`, push on `develop` and `main` | Yes (`exit-code: 1`) — ASSUMPTION: required status check in branch protection, not verifiable from the code |
| Trivy — critical fixture is detected | `security.yml` / `trivy-detects-critical` | same | Yes |
| commitlint — PR title and commits | `.github/workflows/commitlint.yml` / `commitlint` | `pull_request` (`opened`, `edited`, `synchronize`, `reopened`) | Yes — same ASSUMPTION |

### Trivy (`security.yml`)
- Pinned: Trivy `v0.76.1` (`TRIVY_VERSION`) through `aquasecurity/trivy-action@v0.36.0`.
- `trivy` job: `scan-type: fs` on `.`, scanners `vuln,secret`, severities
  `HIGH,CRITICAL`, `ignore-unfixed: true`, `skip-dirs: .github/fixtures`. A
  fixable HIGH/CRITICAL dependency vulnerability or a committed secret fails the job.
- `trivy-detects-critical` job: proves the gate is not blind. It runs a scan
  (`vuln`, `CRITICAL`, `exit-code: 1`) on `.github/fixtures/trivy-vulnerable`
  with `continue-on-error: true`, then a final step **fails unless the scan
  outcome is `failure`**. If Trivy ever passes on the fixture, this job goes red.
- Fixture: `.github/fixtures/trivy-vulnerable/` holds a `package.json` and
  `package-lock.json` pinning `minimist` 1.2.5 (CVE-2021-44906, critical).
  **Never update it**; it is excluded from the repository scan on purpose.
  Dependency-update tooling must leave it alone.

### commitlint (`commitlint.yml`)
- Pinned: `@commitlint/cli` and `@commitlint/config-conventional` `21.2.4`
  (`COMMITLINT_VERSION`), installed with `npm install --no-save --no-package-lock`
  into `$RUNNER_TEMP/commitlint` (nothing is added to the project's dependencies),
  on Node 24.
- Rules: `.github/commitlint.config.mjs` extends `@commitlint/config-conventional`
  (Conventional Commits, vision §17.3). The preset path comes from the
  `COMMITLINT_PRESET` environment variable, exported by the install step.
- Two steps: the **PR title** (piped to commitlint) and **every commit** in
  `base.sha..head.sha` (checkout with `fetch-depth: 0`). The title counts as much
  as the commits: with « rebase and merge » the commits land, with squash the
  title lands.

## Environments and runtime
TO DOCUMENT — environments, configuration and secrets handling, deployment
topology and rollback path.

## Observability
TO DOCUMENT — logs, metrics, traces, health checks, alerting.

## Risks, mitigations and runbook
- **Trivy job red on a new CVE** — upgrade the dependency. Do not edit the
  fixture to silence it. Vulnerabilities without a fix are already ignored
  (`ignore-unfixed`).
- **`trivy-detects-critical` red** — Trivy no longer fails on the fixture
  (database or version change, fixture modified). The `trivy` job may then be
  passing for the wrong reason: fix this before trusting it.
- **commitlint red** — edit the PR title (the `edited` trigger re-runs the check) or
  reword the offending commit and force-push.
- Other risks and the 3am runbook: TO DOCUMENT.
