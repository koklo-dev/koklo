---
title: Quality and operations
audience: technical
doc_version: 0.2.0
status: draft
last_reviewed: 2026-10-29
covers_release: unreleased
sources: []
covers_commit: 7f97066
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
- **UI components tests** (`packages/ui/test/`, TK-84, jsdom, same command): `icon.test.tsx`
  (`Icon` sizes, filled/outline, decorative vs named), `icon-button.test.tsx` and
  `helpers/a11y.ts` (an icon button without an accessible name fails the test),
  `status-badge.test.tsx` (an icon for each of the three statuses), `shapes.test.tsx` (radii,
  heights, borders of DESIGN.md §5), `components-behavior.test.tsx` (interaction of the Radix
  components), `entrypoint.test.ts` (everything is exported from the entry point, no sub-path),
  `no-lucide.test.ts` (no `lucide*` import in the workspace). The Biome rule
  `noRestrictedImports` enforces the same ban in `pnpm lint`; `**/generated` and
  `**/test-results` are excluded from Biome.
- **Worker tests** (`apps/worker`, TK-12): `src/config.test.ts` covers `loadConfig`.
  `test/noop.integration.test.ts` starts a real `postgres:17-alpine` with
  `@testcontainers/postgresql`, calls `startWorker`, publishes a `noop` job with
  `boss.send` and polls `getJobById` (timeout 30 s) until its state is `completed`
  (acceptance criterion of TK-12). The package's Vitest config raises `testTimeout`
  to 60 s and `hookTimeout` to 180 s (first image pull) and excludes `src/main.ts`
  from coverage. Requires Docker.
- **Observability tests** (TK-19): `packages/observability/test/` (logger JSON, redaction,
  no-op without DSN, `captureError` never throws, `setupObservability`);
  `apps/api/test/observability-config.test.ts` and `observability-app.test.ts` (config,
  `requestId` on log lines, no secret header in logs); `guard-capture.test.ts` (capture with
  `requestId`, then `INTERNAL`; it prints two JSON lines on stdout, cosmetic);
  `apps/worker/src/observability*.test.ts` (`jobId`/`queue`, capture and rethrow). No
  GlitchTip instance is needed: the SDK is mocked with `vi.mock("@sentry/node")`.
- **UI browser e2e** (`packages/ui/e2e/`, Playwright `1.64.1`, `pnpm e2e` / `pnpm --filter
  @koklo/ui e2e`): `fonts.spec.ts` (no remote font request at load) and `components.spec.ts`
  (TK-84). The latter bundles `e2e/fixture/main.tsx` with esbuild (code splitting, so generated
  icons stay on-demand files), compiles `src/styles/index.css` with Tailwind, serves both from a
  local HTTP server on a random port, then checks in Chromium: the three `StatusBadge` statuses
  render a non-empty icon path, an `IconButton` icon loads, a `Sheet` opens as a dialog and closes
  on Escape, a `Select` opens and picks an option, with no page error and no request outside the
  local origin. `playwright.config.ts` reads `PLAYWRIGHT_CHANNEL` (e.g. `chrome`) to reuse an
  installed browser; otherwise run `playwright install chromium`. Other packages define no e2e
  yet.

### Lint, types and build (workspace)
- `pnpm lint`: `biome ci` per package, using the shared `packages/config/biome.json`
  (formatter: spaces, line width 100; recommended rules plus the three error-level
  rules listed in [architecture.md](architecture.md#monorepo-workspace-tk-1)), then
  `turbo boundaries` and the deep-import check (TK-3, see
  [architecture.md](architecture.md#package-boundaries-tk-3)). Any of the three failing
  fails the lint.
- `pnpm typecheck`: `tsc --noEmit` against `tsconfig.base.json` (TypeScript 7.0.2).
- `pnpm build`: `packages/config` has nothing to build (`echo 'nothing to build'`);
  `packages/ui` compiles its entry point (components, `Icon`, `cn`) to `dist/` with `tsc -p tsconfig.build.json`.
- Pinned tool versions (2026-10-26, per ADR 0001): pnpm 12.15.0, turbo 2.11.10,
  Biome 2.6.3, Vitest 5.0.5, TypeScript 7.0.2.

## Observability (TK-19)
| Variable | Applies to | Meaning |
|----------|------------|---------|
| `LOG_LEVEL` | api, worker | `fatal`, `error`, `warn`, `info` (default), `debug`, `trace`, `silent`; an unknown value stops the process at startup |
| `SENTRY_DSN` | api, worker | optional DSN of GlitchTip (Sentry protocol); empty or absent disables error reporting |
| `APP_ENV`, `APP_VERSION` | api, worker | `environment` and `release` sent with each reported error |

- **Logs**: one JSON object per line on stdout (pino); the platform collects stdout. No
  `console.*` in application code.
- **Correlation**: every api line carries `requestId` (the incoming `x-request-id`, capped at
  128 characters, else a UUID; it is also the id returned in the `INTERNAL` error body).
  Worker lines carry `jobId` and `queue`. The same ids are attached as tags on the error sent
  to GlitchTip.
- **Redaction**: `authorization` and `cookie` (request headers and top-level fields) are
  replaced by `[Redacted]`. Unexpected errors are logged by name only, since a driver message
  may quote a host or credentials.
- **Without a DSN**: nothing is sent and nothing fails; this is the default in local
  development and in tests. To test the reporting path, mock the SDK as the tests do
  (`vi.mock("@sentry/node", () => ({ init: vi.fn(), captureException: vi.fn() }))`) and
  assert on `init` / `captureException`; to read logs in a test, pass
  `AppModule.forRoot(config, { logStream })` and parse the lines.
- **Failure isolation**: a failing SDK never changes a response or a job outcome.

### Emails and magic link (TK-22)
- **Sending**: the api never sends mail. Better Auth's `sendMagicLink` enqueues
  `{ email, url }` on the `send-magic-link` pg-boss queue; the worker sends it (3 attempts).
  Link lifetime 600 s, token stored hashed, single use, no sign-up through a link.
- **Capture vs Resend**: without `RESEND_API_KEY`, `APP_ENV` `development` or `test` uses the
  in-memory `CaptureMailSender` (no network). In `staging` or `production` a missing key stops
  the worker at startup (`RESEND_API_KEY is required when APP_ENV is staging`); with a key,
  `MAIL_DOMAIN` and `EMAIL_FROM` are required and the sender must belong to the domain. Error
  messages name the variable, never its value.
- **Payload retention**: the job payload carries the link (hence the token), so the queue keeps
  completed and archived jobs for 1 hour at most (`deleteAfterSeconds` / `retentionSeconds`
  = 3600, re-applied with `updateQueue` at each start).
- **Redaction**: `token`, `url`, `data.*`, `job.data.*` and the response `set-cookie` header
  (session token) are replaced by `[Redacted]`; the request logger keeps the path only (query
  string and fragment dropped, `request-serializer.ts`). A Resend failure is raised as
  `Resend a refusé l'envoi (<name>)`, without the body.
- **Image content**: `@koklo/worker` is a devDependency of the api (tests start the worker
  and read the capture). `pnpm deploy --prod` in `apps/api/Dockerfile` leaves it, and
  `resend`, out of the api image (checked: only config, contract, db, observability remain);
  `turbo prune` and the builder stage do contain it, which only costs build time.
- **Open**: remove `resend@6.35.0` from `minimumReleaseAgeExclude` (`pnpm-workspace.yaml`)
  once its release age passes.

## Invitations (TK-23)
- **Flow**: `member.invite` creates the invitation (`pending`, 7 days) and the plugin callback
  enqueues `{ email, url, inviterName, organizationName, role }` on `send-invitation`; the
  worker sends it (3 attempts, payload kept 1 h at most, link and `data` redacted in logs).
  The acceptance page is out of scope.
- **Known limit 1, enqueue failure**: Better Auth awaits `sendInvitationEmail` as a background
  task and swallows its errors (it logs "Failed to run background task"). If pg-boss is down,
  the invitation exists without an email and the API answers 200. Mitigation added: the
  producer logs `enqueue failed` (queue and error name, no payload) and reports to Sentry
  (tag `queue`); covered by `apps/api/test/enqueue-failure.test.ts`. Lead for later: a resend
  procedure, or a transactional outbox, so the invitation and its job commit together.
- **Known limit 2, `last_owner` race**: two concurrent demotions of owners can abort the
  Serializable transaction; the caller gets `INTERNAL` (500), not `CONFLICT`. The invariant
  holds (no organization without an owner). Mapping Prisma `P2034` to a retry is a possible
  follow-up.
- **Tests**: build the worker before running api tests alone (`@koklo/worker` is read from
  `dist`; `pnpm test` chains it through turbo).

## Multi-tenant isolation (TK-20)
- Tests: `packages/db/test/tenant-extension.test.ts` (ephemeral PostgreSQL: no context on 16
  operations, two organizations, create/upsert rules, excluded models, raw SQL) and
  `tenant-guard.test.ts` (no database).
- **Rule for a new model with `organizationId`**: add it to `TENANT_MODELS` (with
  `@@index([organizationId])`) or to `TENANT_EXCLUDED_MODELS` with a reason, in
  `packages/db/src/tenant-extension.ts`. Otherwise `tenant-guard.test.ts` fails.
- Raw SQL is refused on the extended client; use `DatabaseService.raw` only for infrastructure
  (health probe, Better Auth), never for a business model.
- Known limit: the `upsert` ownership check is not atomic (unique constraint is the safety net).

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
GitHub refuses secret names starting with `GITHUB_`, so in the infra environment
(`koklo-<env>`) the two values are entered as `OAUTH_GITHUB_CLIENT_ID` and
`OAUTH_GITHUB_CLIENT_SECRET`; the manifest maps them to `GITHUB_CLIENT_ID` and
`GITHUB_CLIENT_SECRET` for the API with `vars` (`${secrets.…}`). The optional GitHub App
secrets follow the same rule: `GH_APP_ID`, `GH_APP_PRIVATE_KEY` and `GH_WEBHOOK_SECRET` are mapped to
`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` and `GITHUB_WEBHOOK_SECRET` for the API and the worker.
`GH_APP_PRIVATE_KEY` holds the `.pem` as **one base64 line**, not the raw multi-line key:
`init-app-env.sh` reads a single line, so it is skipped there (Enter) and set separately from the
infra checkout with
`base64 -w0 <key>.pem | gh secret set GH_APP_PRIVATE_KEY -R josias-koffi/infra -e koklo-<env>`.
Whatever reads `GITHUB_APP_PRIVATE_KEY` (the GitHub App client, R2) must base64-decode it before
signing the JWT.
`BETTER_AUTH_URL` is the public URL of the web (`https://app-staging.koklo.dev`,
`https://app.koklo.dev`), set by the manifest from `${domains.app}`: the API has no domain, so
the callback lands on the web origin and the web proxies it to the API through `API_INTERNAL_URL`
(injected by `uses: [api]`).

Deployment (TK-18): `.github/workflows/deploy.yml` is the infra template (`resolve`, `build`,
`image-check`, `deploy`). `build` pushes `ghcr.io/koklo-dev/koklo-{web,api,worker}` tagged with
the commit. `image-check` starts the api image at the tag to deploy against a throwaway Postgres
(`migrate deploy`, then `GET /health`) before any environment is touched; it replaces the
post-deploy smoke test of the api, which infra only plays on components with a domain. It also
runs on a promotion, where `build` is skipped. Production is a manual run (`deploy: manual`)
with the `image_tag` already validated in staging: nothing is rebuilt. Existing `api*.koklo.dev`
DNS records are not removed by infra: delete them by hand.
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

## Web: organizations, members, project creation (TK-24)
- **Unit and component tests** (`apps/web/test`, Vitest, mocks in `test/support/web-mocks.ts`):
  `auth-guard.test.ts`, `session.test.ts`, `proxy.test.ts` (access matrix and redirects),
  `organizations-page.test.tsx`, `members-page.test.tsx`, `projects-page.test.tsx`,
  `team-switcher.test.tsx`, `organizations-members-routes.test.tsx`, `projects-layout.test.tsx`,
  `design-conformity.test.ts`. Web: 191 tests passing at the end of the refactor step
  (`.workflow/TK-24/05-refactor.md`); line coverage 99.21 %, branches 94.80 %.
- **Real-stack e2e** (`e2e/tests/organizations.spec.ts`, `pnpm e2e`): C1 (session without organization,
  `/projects` goes to `/organizations`, create the organization, create a project), G1 (no `/login` <->
  `/projects` loop), C1.d (without session, the three pages go to `/login`). The session cookie without active
  organization is forged by `e2e/support/session.ts`. 5 e2e passing (2 in `projects.spec.ts`).
- **Stub-API suite** (`apps/web/e2e`: `organizations.spec.ts`, `a11y.spec.ts` axe on `/members` and
  `/organizations`, including the active-organization case) writes the captures in `design/screens/captures/`.
  It was run after the Refactor step, once the `next dev` that blocked it was stopped: 54 tests passed
  (axe WCAG AA in light and dark, captures, sidebar, theme, mobile 375 px on the projects page, reduced motion).
- **Mail in development**: invitations are queued on `send-invitation`; with `APP_ENV` `development` or
  `test` the worker uses the in-memory `CaptureMailSender` (see [Emails and magic link](#emails-and-magic-link-tk-22)):
  nothing reaches a real mailbox. Resend is used only in `staging` and `production`.
- **Known limits**: the email link `/accept-invitation/<id>` is a 404 (no page yet); no pending-invitation
  list, no resend; `engineering-rules` was not available in the delivery session, so rule evidence ids are
  UNVERIFIED for this ticket.

## Real-stack e2e (TK-15)

`pnpm e2e` (`e2e/scripts/run.ts`, package `@koklo/e2e`) starts a throw-away Compose project
`koklo-e2e` (Postgres on `E2E_DB_PORT`, default 54329), runs migrate and seed, builds, starts the
API (`E2E_API_PORT`, 3201, `APP_ENV=test`) and the standalone web server (`E2E_WEB_PORT`, 3200),
then `playwright test`; the exit code is Playwright's and everything is torn down (`down -v`).
The test creates a real Better Auth session row for the seed admin and signs the cookie with the
fake e2e secret defined in the script (no real secret). It does not use the stub API of
`apps/web/e2e`. The CI job `e2e` runs the same command (`pnpm --filter @koklo/e2e exec playwright
install --with-deps chromium` first). `turbo run e2e` still only runs the stub-API suites of
`apps/web` and `packages/ui`; the real-stack package exposes its Playwright call as `stack`.

## App shell and login blocks (TK-85)

`apps/web` uses the shadcn blocks `sidebar-07` (app shell) and `login-05` (login page), **generated by
the shadcn CLI 4.23.0** (`npx shadcn@latest add sidebar-07` then `add login-05 --overwrite`, from
`apps/web`, configured by `apps/web/components.json`). Block files are kept faithful to the CLI output:
`app-sidebar`, `nav-main`, `nav-projects`, `nav-user`, `team-switcher`, `login-form` in
`apps/web/src/components`, and `sidebar`, `breadcrumb`, `collapsible`, `field`, `label` in
`packages/ui/src/components`. The shell is mounted by `apps/web/src/app/projects/layout.tsx`.
Only imports, tokens, icons (`Icon`, Material Symbols Rounded) and French copy differ from the blocks.
Screen contracts: `design/screens/S-login.md` and `design/screens/S-projects.md`.

Lint: `packages/ui/biome.json` has one override, limited to the five generated `packages/ui` files,
turning off 7 rules their upstream code violates (function length, `noDocumentCookie`, `noDoubleEquals`,
`noArrayIndexKey`, `useExhaustiveDependencies`, `useSemanticElements`, `useFocusableInteractive`).
Each was checked as still needed on 2026-10-28.

Tests that guard it:
- `packages/ui/test/sidebar.test.tsx`, `sidebar-parts.test.tsx`: exports, `SidebarTrigger`, no
  `complementary` landmark, mobile `Sheet`, 768 px breakpoint, rail "Réduire ou agrandir la barre latérale".
- `packages/ui/test/shadcn-blocks.test.ts`, `apps/web/test/shadcn-blocks-files.test.ts`: block files
  present, single-file sidebar, no leftover hand-made split.
- `packages/ui/test/sidebar-tokens.test.ts`, `no-hardcoded-colors.test.ts`: `--sidebar-*` tokens, no colour literal.
- `apps/web/test/projects-layout.test.tsx` (shell, one `main`, `nav`, projects from `project.list`),
  `login-form.test.tsx` (single GitHub provider, states, notice).
- Playwright (stub API): `sidebar.spec.ts` (keyboard, axe AA light/dark, mobile `Sheet`), `login.spec.ts`,
  `projects.spec.ts`.

Selector changes for the real-stack e2e of TK-15: TO DOCUMENT (not part of this diff).
