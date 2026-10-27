---
title: Quality and operations
audience: technical
doc_version: 0.1.0
status: draft
last_reviewed: 2026-10-27
covers_release: unreleased
sources: []
covers_commit: 9830e2e
---
# Quality and operations

## Test strategy and evidence
- **Unit tests**: Vitest 5, run per package by `pnpm test` (`vitest run --coverage`,
  through Turborepo). The shared config (`@koklo/config/vitest`) picks up
  `src/**/*.test.ts` and `test/**/*.test.ts`, uses v8 coverage over `src/**/*.ts`
  (excluding test files) and enforces **lines ≥ 80 %, branches ≥ 70 %** (CDC §19.2).
  Coverage below a threshold fails the run.
- **Lint rules under test** (`packages/config/test/biome-rules.test.ts`): runs
  `biome ci` on `packages/config/fixtures/`. A 51-line function must fail with
  `noExcessiveLinesPerFunction`; a 50-line function must pass.
- **Boundary rules under test** (`packages/config/test/boundaries.test.ts`): copies the
  workspaces of `packages/config/fixtures/boundaries/` to a temporary directory, applies
  the root `turbo.json` `boundaries` block and runs `turbo boundaries`. `valid` must
  pass (exit 0); `domain-depends-on-db` must fail and name `@fixture/db`. The
  `deep-import` fixture (`web` importing `@fixture/ui/src/button`) must make
  `check-deep-imports` exit 1; `exports` patterns and the real repository (no deep
  import) are also covered. Do not "fix" the violating fixtures.
- **Size gate under test** (`packages/config/test/check-size.test.ts`): covers the
  acceptance criteria of TK-2 (301-line source file fails, waiver handling, migrations
  and generated files not counted). Test names and fixtures: see the file.
- **Contract tests** (`packages/contract/test/contract.test.ts`, TK-9): CT-2/CT-3 check
  the `health` and `project.list` schemas by validating accepted and rejected values;
  CT-4 checks explicit, unique method + path pairs (`GET /health`, `GET /projects`);
  CT-5 checks the typed errors and the 401/403/500 responses in the OpenAPI; CT-6 checks
  generation and determinism; CT-7/CT-8 are the guard "the OpenAPI does not change
  without a version change" (generated document = `openapi/openapi.json`,
  `info.version` = `package.json` version, sha256 = entry in `openapi/versions.json`);
  CT-9 checks the public exports and inferred types. Details:
  [api-contract.md](api-contract.md#compatibility-and-breaking-changes).
- **Database tests** (`packages/db/test/`, `packages/db/src/rollback.test.ts`, TK-7):
  `migration-cycle.test.ts` (T1.x) applies `migrate deploy` on an empty ephemeral
  Postgres 17, runs `down.sql`, applies again, and requires an empty
  `migrate diff --exit-code` against `schema.prisma`; T2.1 requires a non-empty
  `down.sql` in every migration. `schema.test.ts` (T3.x) checks table names,
  snake_case, uuid keys and `created_at`/`updated_at`. `root-scripts.test.ts` (T4.1)
  covers the root scripts; `rollback.test.ts` covers the rollback logic with fake ports.
  The database comes from Docker (random host port, never 5432) or `TEST_DATABASE_URL`.
- **API tests** (`apps/api/test/`, `apps/api/src/project/project.service.test.ts`, TK-10):
  `project-list.test.ts` (C1.x) runs the real Nest app on an ephemeral Postgres 17
  (`@koklo/db/testing`, `migrate deploy`, seed): seed projects returned, tenant
  isolation, deterministic order, empty organization, 401 by default, `INTERNAL` on
  database failure. `health.test.ts` (C2.x) covers 200 / `INTERNAL` 500, the 2 s probe
  timeout and `x-request-id`. `openapi.test.ts` (C3.1) and `config.test.ts` (C3.3)
  cover `/openapi.json` and `.env.example` consistency. TK-11 adds `auth-session.test.ts`
  (no, forged or expired cookie gives 401; a valid member gets the active organization's
  projects; a client-supplied organization is ignored; no active organization or non-member
  gives 401; `x-test-session` is accepted only with `APP_ENV=test`, malformed gives 401 not
  500; `/health` and `/openapi.json` stay public; OpenAPI declares 401) and
  `auth-oauth.test.ts` (`/api/auth/*` mounted and returns the GitHub authorization URL;
  callback with a simulated GitHub creates user, account and session; unknown `state`
  creates none).
- **UI foundations tests** (`packages/ui/test/`, TK-13, `pnpm --filter @koklo/ui test`):
  `theme-fidelity.test.ts` checks that every variable of DESIGN.md §2.1 exists with the same
  value, light and dark; `theme-mapping.test.ts` the `@theme inline` mapping;
  `contrast.test.ts` requires WCAG AA 4.5:1 for every text/background pair of §2.1 and for
  the three statuses of §2.2, in `:root` and `.dark` (a pair below the threshold fails the
  suite; the helper itself is tested on #787878 vs #767676 on white);
  `fonts.test.ts` and `fonts-transitive.test.ts` forbid any `fonts.googleapis.com` /
  `fonts.gstatic.com` reference and any remote source, and require the exact Fontsource
  weights; `status-typography.test.ts` covers the status variables and the type scale;
  `cn.test.ts` covers `cn`. Changing a "to confirm" value in `tentative.css` is validated by
  these same tests.
- **Worker tests** (`apps/worker`, TK-12): `src/config.test.ts` covers `loadConfig`.
  `test/noop.integration.test.ts` starts a real `postgres:17-alpine` with
  `@testcontainers/postgresql`, calls `startWorker`, publishes a `noop` job with
  `boss.send` and polls `getJobById` (timeout 30 s) until its state is `completed`
  (acceptance criterion of TK-12). The package's Vitest config raises `testTimeout`
  to 60 s and `hookTimeout` to 180 s (first image pull) and excludes `src/main.ts`
  from coverage. Requires Docker.
- Other levels (e2e): TO DOCUMENT (`pnpm e2e` exists as a Turborepo task, no package
  defines it yet).

### Lint, types and build (workspace)
- `pnpm lint`: `biome ci` per package, using the shared `packages/config/biome.json`
  (formatter: spaces, line width 100; recommended rules plus the three error-level
  rules listed in [architecture.md](architecture.md#monorepo-workspace-tk-1)), then
  `turbo boundaries` and the deep-import check (TK-3, see
  [architecture.md](architecture.md#package-boundaries-tk-3)). Any of the three failing
  fails the lint.
- `pnpm check:size` (also run by `pnpm lint`, after `biome ci`): fails when a source
  file exceeds 300 lines or a test file 500 lines, unless covered by a non-expired
  waiver in `.koklo/waivers.yaml`. Failure output is one line per file on stderr,
  prefixed `check:size`, e.g. `path/file.ts : 301 lignes (limite 300)`; an expired
  waiver adds `dérogation expirée le <date> (<auteur>)`. Details and the waiver
  format: [architecture.md](architecture.md#file-size-gate-checksize-tk-2).
  Adding a waiver: append an entry to `waivers:` in `.koklo/waivers.yaml` with a real
  justification and an expiry date; remove it once the file is split.
- `pnpm typecheck`: `tsc --noEmit` against `tsconfig.base.json` (TypeScript 7.0.2).
- `pnpm build`: `packages/config` has nothing to build (`echo 'nothing to build'`);
  `packages/ui` compiles `cn` to `dist/` with `tsc -p tsconfig.build.json`.
- Pinned tool versions (2026-10-26, per ADR 0001): pnpm 12.15.0, turbo 2.11.10,
  Biome 2.6.3, Vitest 5.0.5, TypeScript 7.0.2.

## Quality gates
Workflows in `.github/workflows/`: `ci.yml`, `commitlint.yml`, `security.yml`,
`release-please.yml`. Lint, types and coverage gates: TO DOCUMENT (`ci.yml` was not
part of this sprint's range).

### Security scan (`security.yml`)
- Triggers: every pull request, and pushes to `develop` and `main`. Permissions
  `contents: read`; concurrency per ref, `cancel-in-progress: true`.
- Trivy is pinned (`TRIVY_VERSION: v0.76.1`, `aquasecurity/trivy-action@v0.36.0`).
- Job `trivy` scans the repository filesystem (`scanners: vuln,secret`, severity
  `HIGH,CRITICAL`, `ignore-unfixed: true`, `exit-code: 1`), skipping `.github/fixtures`.
  Vulnerable dependencies or committed secrets fail the check.
- Job `trivy-detects-critical` proves the gate is not blind: it scans
  `.github/fixtures/trivy-vulnerable` (a deliberately vulnerable `package.json` and
  lockfile) with `continue-on-error`, and fails unless the scan outcome was `failure`.
  Never "fix" or remove that fixture.

### Conventional Commits (`commitlint.yml`)
- Trigger: pull request `opened`, `edited`, `synchronize`, `reopened`.
- Installs `@commitlint/cli` and `@commitlint/config-conventional` at `21.2.4` into a
  temporary directory; `.github/commitlint.config.mjs` extends the preset whose path
  is passed through `COMMITLINT_PRESET` (falling back to the package name).
- Steps: (1) a non-conventional title (`Add stuff`) must be rejected, otherwise the
  gate is ignoring its config; (2) the PR title is linted; (3) every commit between the
  PR base and head SHA is linted. The title matters as much as the commits: with
  "rebase and merge" the commits land, with squash the title does.
- Whether these checks are required by branch protection: TO DOCUMENT.

## Delivery loop
`.project/loop/` holds the autonomous delivery loop (shipyard). Summary taken from the
header of `agent-loop.sh`:

- Phase 1 (dev): pick a todo issue, create a worktree and branch, run the dev agent,
  commit, push, open the PR, mark the issue `status:in-review`, move on. It never waits
  for CI or a review.
- Phase 2 (review), same run: for each in-review issue, a fresh review session waits for
  green CI, applies the hard gates, then approves and rebase-merges (squash only if the
  branch carries a merge commit). A non-approval feeds the verdict into a fix session;
  round and conflict-fix progress is persisted per issue. Exhausted attempts mark the
  issue `blocked` and send a notification.
- Status source: the GitHub Project (current Sprint iteration + Status) when configured,
  otherwise issue labels; labels are mirrored in Project mode.
- Prompts: `prompt-dev.md`, `prompt-review.md`, `prompt-unblock.md`, `prompt-retro.md`,
  `prompt-doc.md`. Per commit `3c63a2c`, each ticket follows the `koklo-delivery` workflow.

| Script | Role (from its header) |
|--------|------------------------|
| `agent-loop.sh` | control flow of the loop |
| `claude-invoke.sh` | single entry point for every Claude Code call; owns auth and quota back-off |
| `ticket-backend.sh` | `ticket_*` contract isolating the loop from the ticket tracker |
| `materialize-sprint-issues.sh` | projects unchecked vault sprint tasks into GitHub Issues/Project (idempotent) |
| `upsert-project-issue.sh` | creates or reuses an exact-title issue and sets its Project/Sprint fields |
| `vault-task-status.sh` | writes a task's delivery state back into the vault sprint file |
| `security-alerts-to-issues.sh` | one board issue per vulnerable package from open Dependabot alerts (default minimum severity `high`) |
| `purge-worktrees.sh` | reclaims disk from worktrees and stale local branches left by killed runs |
| `notify.sh` | pluggable phone notifications; silent no-op when no backend is set |
| `happy-pilot.sh` | tmux-wrapped Claude session to monitor and unblock the loop from mobile |

- PR body refresh (`sync_pr_body` in `agent-loop.sh`, commit `aaf14e6`): the body is
  now written through the REST API (`gh api -X PATCH` on the pull request), with
  `gh pr edit --body-file` kept as fallback. Per the code comment, `gh pr edit` goes
  through GraphQL and fails on repositories where gh still sees a classic project, so
  the reviewer judged a stale body. A failure of both is logged and non-fatal.

Machine-specific settings go in `.project/loop/env.local` (git-ignored).

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
Local database (TK-7): `docker-compose.yml` runs `postgres:17-alpine` on
`127.0.0.1:${KOKLO_DB_PORT:-5432}` with development credentials `koklo`/`koklo`.
`DATABASE_URL` comes from the environment or `packages/db/.env` (template:
`.env.example`); `SHADOW_DATABASE_URL` is only needed for `migrate dev` and
`migrate diff --to-migrations`. Other environments, secrets handling and deployment
topology: TO DOCUMENT.

API secrets (TK-11): `BETTER_AUTH_SECRET`, `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`
are set in each deployment's environment, never in `.env.example` or the repository. The
GitHub OAuth App is one per environment, callback `<BETTER_AUTH_URL>/api/auth/callback/github`.
The test session (`x-test-session`) exists only when `APP_ENV=test`: never run a deployed
environment with that value. Secret storage and rotation: TO DOCUMENT.

Demo seed: `pnpm db:seed` (delegates to `@koklo/db` `seed`, `node scripts/seed.ts`)
upserts fixed-id demo rows in a single transaction and rolls back on error. It is
idempotent, but it overwrites any edit made to those rows (name, slug, email, role,
dates). Test: `packages/db/test/seed.test.ts`; `root-scripts.test.ts` checks the root
`db:seed` script. Demo emails use the reserved `.test` domain.

Database rollback path: `pnpm db:rollback` undoes the latest migration (its `down.sql`,
then removal of its `_prisma_migrations` row). It is not transactional, so take a backup
first outside development. Whether CI runs the `@koklo/db` tests (they need Docker):
TO DOCUMENT.

## Observability
TO DOCUMENT — logs, metrics, traces, health checks, alerting.

## Risks, mitigations and runbook
TO DOCUMENT — known risks, their mitigations, and what to do at 3am.
