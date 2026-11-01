---
title: Quality and operations
audience: technical
doc_version: 0.2.0
status: draft
last_reviewed: 2026-11-01
covers_release: unreleased
sources: []
covers_commit: bb9f740
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
- **Integration Postgres hygiene** (fix `testcontainers-anonymous-volumes`): the
  `postgres:17-alpine` image declares `VOLUME /var/lib/postgresql/data`, so every test container
  creates an anonymous Docker volume that `stop()` does not remove. Rules: (1) every test
  Postgres mounts its datadir on **tmpfs** (`.withTmpFs({ "/var/lib/postgresql/data": "rw" })`
  through `apps/worker/test/support/postgres.ts`; `--tmpfs` in `postgresRunArgs()` of
  `packages/db/src/testing/test-database.ts`); no test calls `new PostgreSqlContainer` directly
  (static guard `apps/worker/test/postgres-tmpfs.test.ts`, args guard
  `packages/db/test/test-database-args.test.ts`). (2) Every container is stopped in `afterAll`
  (`database?.stop()` / `db?.dispose()`, which runs `docker rm -f -v`); the `packages/db` helper also
  removes live containers on process `exit`, and testcontainers' Ryuk reaper must stay enabled
  (never set `TESTCONTAINERS_RYUK_DISABLED`). (3) After a batch of test runs, a human may clean
  leftovers manually (never `docker system prune` nor `docker volume prune -a`):
  `docker container prune -f --filter label=org.testcontainers=true && docker volume prune -f`.
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

### Webhook ingestion: configuration and verification (TK-45c1)
| Variable | Read by | Meaning |
|----------|---------|---------|
| `GITHUB_WEBHOOK_SECRET` | API | deployed from the **required** secret `GH_WEBHOOK_SECRET` (TK-47: a deployment without it fails). In local dev it stays optional; absent or empty: the API starts, logs one warning naming the variable (never a value) and `POST /api/webhooks/github` answers 503 until it is set |

- **Route.** Raw body capped at 5 MiB (`413` above, decided from `Content-Length` before reading). Order
  of checks: 503, 413, 415, 401, 400, 202 (see `architecture.md`). The web app relays the path to the
  API unchanged and without a session.
- **GitHub App URLs.** Staging: `https://app-staging.koklo.dev/api/webhooks/github`. Production:
  `https://app.koklo.dev/api/webhooks/github`. Content type `application/json`, secret equal to the one
  stored as `GH_WEBHOOK_SECRET`.
- **Human verification (NEEDS-HUMAN).** After configuring the App and the secret on an environment,
  open the App settings, Advanced, **Recent Deliveries**: the `ping` delivery must show a 2xx status
  (202). A 503 means the secret is missing on the server; a 401 means the secrets differ. Use
  Redeliver to replay: the replay answers 202 and creates nothing.
- **Logs.** Signature headers are masked; no secret, body or author appears in a log line or an error.

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

### LLM prompts and outputs: what is never logged (TK-50a)
- Never log, report to GlitchTip or put in an error message the content of an `Untrusted`, a
  `FramedPrompt` (`system` or `user`), or a model output. The domain errors (`InvalidUntrustedOriginError`,
  `UntrustedDelimiterCollisionError`, `LlmInvalidOutputError`) carry only an origin, a rank or a fixed
  reason; keep it that way in callers and adapters. Logging the origin, the rank, a size or a duration is fine.
- The nonce is injected by the caller (the domain has no randomness): generate a fresh unpredictable
  one per call in the adapter, 16 to 64 alphanumeric characters, and do not reuse it across calls.
- Treat a `UntrustedDelimiterCollisionError` as a refusal of that datum, not as something to escape.
- A `Validated` output is a proposal: no effect without human validation (vision §6.3).

### LLM provider keys, budget and errors (TK-50b)
- **Never log a key.** A BYOK key is an `LlmCredential`: every rendering (template, `String`, JSON,
  `util.inspect`, `console`) gives `[redacted]`. Call `revealLlmCredential` only in the adapter, at
  the moment of building the request, and never keep the revealed string in a log line, an error
  or a GlitchTip event.
- The typed errors (`LlmProviderError` and subclasses, `InvalidLlmCredentialError`,
  `InvalidLlmRequestError`, `InvalidLlmBudgetError`) carry only `operation`, `provider`, `status`, a
  fixed `reason`, `field` or `limit`: no key, no prompt, no model output, no response body, no header
  and no `cause`. When mapping a vendor failure, build the error from those fields only; do not pass
  the vendor error along. Logging the `provider`, the `status`, the `operation`, a size or a duration
  is fine.
- `trace.purpose` and `trace.correlationId` match `[A-Za-z0-9._:-]{1,64}`: they are the only free
  identifiers allowed in logs next to an LLM call.
- Every call has a mandatory budget (tokens, duration, prompt size, cost) capped by the domain at
  5 USD per call; run `assertLlmRequest` before any network call and refuse, never clamp silently.

### BYOK credentials table: database errors (TK-51a)
- **Never log the raw `meta` or `message` of a database error raised on `llm_provider_credentials`.**
  A violated CHECK or unique constraint can carry the offending row, which holds the encrypted key
  (`ciphertext`, `nonce`). Map the error to its SQLSTATE or Prisma `code` (`23514`, `23505`,
  `23503`, `P2002`) and the constraint name, and log only those, with the `organization_id` and
  `provider`.
- The key is encrypted with AES-256-GCM and the AAD `llm:v1:<organization_id>:<provider>`; the AAD is
  not stored (see [domain-model.md](domain-model.md#byok-credentials-table-tk-51a)).

### Suggestions: untrusted text (TK-51b)
- `suggestions.body` and `suggestions.decision_note` are client-supplied and stored raw: never build a
  prompt by concatenation; wrap them with `Untrusted("client-suggestion")`. Do not log them in full
  (log the `key`, the `project_id` and a length).
- Migration `20261101100000_suggestions` is reversible: its `down.sql` deletes every `suggestion`
  counter and every suggestion (data loss by design), recreates `counter_name` without that value, and
  keeps the other counters. `ALTER TYPE ... ADD VALUE` runs in the migration transaction, so no counter
  row is created in the same migration.

### Running the LLM conformance suite (TK-50c)
Every `LlmProvider` adapter (TK-54 and the later ones) must pass the shared suite from
`@koklo/domain/testing`; the domain imports no test engine, so the test file passes its own:

```ts
import { describe, it } from "vitest";
import { runLlmConformance } from "@koklo/domain/testing";

runLlmConformance("AnthropicAdapter", () => makeSubject(), { describe, it });
```

`makeSubject()` returns a `LlmConformanceSubject`: the `provider` under test wired to a simulated
transport (never the network, never a real key), a `validKey`, an `invalidKey` that the transport
refuses, the `servedModel` it answers with, `replyWith(output)` and `failWith(trigger)` to program the
next transport reply or failure, and `callsMade()` (transport calls; must stay unchanged when the
guard refuses a request). Run it with `pnpm --filter <package> test`. `FakeLlm` is the first client of
the suite (`packages/domain/test/llm-conformance.test.ts`), which also checks that broken adapters
(key leak, ignored budget, wrong served model, unmapped auth error, uncapped `retryAfterMs`) are
detected. Use `FakeLlm` in tests of services that call a model; it records calls without the key.
`pnpm --filter @koklo/domain build` must keep resolving `@koklo/domain/testing` (`dist/testing`).

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

## Sprint import command `import:sprints` (TK-34)
Administration command, never an HTTP route: it loads the Nest application context and calls
`SprintImportService`. It imports Shipyard `sprint-NNN.md` files (CDC section 7.7) into sprints and
tickets of one project.

```bash
pnpm --filter @koklo/api import:sprints <directory> \
  --organization <uuid> --project <uuid> --actor <uuid> \
  [--starts-on YYYY-MM-DD] [--ends-on YYYY-MM-DD] [--dry-run] [--json]
```

- **Environment**: same variables as the API (`DATABASE_URL`, ...); `.env` is read when present.
- **Actor**: `--actor` must be an `owner` or `admin` member of the organization, otherwise exit 2.
  A project outside the organization is refused the same way (exit 2).
- **Dates**: sprint files carry no dates. `--starts-on` defaults to today, `--ends-on` to
  `--starts-on`; both are applied to every created sprint. `--ends-on` cannot precede `--starts-on`.
- **`--dry-run`**: same run and same report, then the transaction is rolled back (nothing written,
  counters and audit untouched). **`--json`** prints the full report (every line) instead of the
  readable summary.
- **Exit codes**: `0` import without any `error` line; `1` report with at least one error or
  conflict (or technical failure after configuration loaded); `2` refusal before any write (bad
  usage, unreadable or non-conforming directory, actor not owner/admin, unknown project).
- **Input safety**: one directory, no recursion, no symlink (`O_NOFOLLOW`), 1 MiB per file, strict
  UTF-8. Any `sprint-*` entry that is not `sprint-NNN.md` is refused; other files (backlog,
  retros) are listed as not read.
- **Report**: counts for sprints, tickets and dependencies (created, matched, conflicts, rejected),
  totals per reason code, then one line per warning or error with file, line, key and text.
  Every line of a `## Tasks` zone is classified, none is dropped silently. Reason codes (closed
  list): `blank`, `comment`, `dependency-cycle`, `dependency-target-missing`,
  `deleted-ticket-conflict`, `field-not-imported`, `human-action`, `missing-package`,
  `missing-sensitivity`, `section-not-imported`, `sprint-conflict`, `sprint-dod`,
  `sprint-without-tasks`, `status-conflict`, `status-line-unparsable`, `title-conflict`,
  `unknown-line`. Severities: `ignored`, `warning`, `error`.
- **Idempotence by key**: sprints (`SP-n`) and tickets (`TK-n`) are matched by key only, never by
  title. A matched object is left untouched; same key with another goal (sprint), another title or
  a soft-deleted ticket is a conflict reported as an error. Re-running on the same project is a
  no-op (all matched).
- **Keys and counters**: imported tickets keep their `TK-n` keys. The ticket and sprint counters
  are raised to the highest imported number (never lowered), so the next created ticket does not
  collide. Import into an empty or dedicated project: the keys must be free.
- **Atomicity**: the whole batch is one transaction (10 minute timeout, because 86 tickets exceed
  Prisma's 5 s default); any technical failure leaves the project unchanged. Dependencies are
  validated by `@koklo/domain` (cycle -> `dependency-cycle`). Audit actions: `sprint.import`,
  `ticket.import`, `dependency.import`. A sprint whose tickets are all done is closed after
  attachment, never made active.
- **Tests**: `apps/api/test/sprint-import-*.test.ts` (fixture: frozen copy of the 17 vault sprint
  files in `apps/api/test/fixtures/sprints`).

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
`GITHUB_CLIENT_SECRET` for the API with `vars` (`${secrets.…}`). The GitHub App
secrets follow the same rule and are **required at deployment** (TK-47: listed in the manifest `secrets`,
so a deployment missing any of them fails; local dev and tests stay tolerant): `GH_APP_ID`, `GH_APP_PRIVATE_KEY` and `GH_WEBHOOK_SECRET` are mapped to
`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` and `GITHUB_WEBHOOK_SECRET` for the API and the worker.
`GH_APP_PRIVATE_KEY` holds the `.pem` as **one base64 line**, not the raw multi-line key:
`init-app-env.sh` reads a single line, so it is skipped there (Enter) and set separately from the
infra checkout with
`base64 -w0 <key>.pem | gh secret set GH_APP_PRIVATE_KEY -R josias-koffi/infra -e koklo-<env>`.
Whatever reads `GITHUB_APP_PRIVATE_KEY` (the GitHub App client, R2) must base64-decode it before
signing the JWT.
In the API, `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY` are read as an all-or-nothing pair
(TK-43): neither set (local dev without the App; no longer possible when deployed since TK-47) means the API starts with one warning and
`repo.createSpec` / `repo.link` answer `PROVIDER_UNAVAILABLE`; only one of them fails at startup,
naming the missing variable and never a value. `GITHUB_APP_CLIENT_ID` and
`GITHUB_APP_CLIENT_SECRET` are **optional** and also an all-or-nothing pair (one alone fails at
startup, naming the other): they only serve user tokens (OAuth user-to-server), a flow that is not
implemented yet. Without them the provider is active and any path that needs a user token (a
personal account in `repo.createSpec`) answers `USER_TOKEN_REQUIRED`. `loadConfig` decodes the
base64 key itself (a PEM with literal `\n` is accepted too). The manifest maps
`GH_APP_CLIENT_ID` / `GH_APP_CLIENT_SECRET` to `GITHUB_APP_CLIENT_ID` / `GITHUB_APP_CLIENT_SECRET`
for the API only, as **optional** secrets (`optionalSecrets`): TK-47 made only `GH_APP_ID`, `GH_APP_PRIVATE_KEY` and `GH_WEBHOOK_SECRET` required and kept these two optional.
Two distinct pairs, never interchangeable: `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` (from
`OAUTH_GITHUB_CLIENT_*`) belong to the sign-in OAuth App (Better Auth), while
`GITHUB_APP_CLIENT_ID` / `GITHUB_APP_CLIENT_SECRET` belong to the GitHub App; an authorisation code
issued by one cannot be exchanged by the other, and the App configuration never reads the sign-in
pair. See [API contract](api-contract.md), "Provider not configured".
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

Demo seed (vision §18.3): `pnpm db:seed` (delegates to `@koklo/db` `seed`, `node scripts/seed.ts`)
loads one organization, an admin and a client, the demo project, an active sprint `SP-1` and
six linked tickets `TK-1`..`TK-6` (all kanban columns, `blocks` and `related` edges, labels,
feature refs, acceptance criteria), with the `ticket` and `sprint` counters set to 6 and 1 (the
next ticket is `TK-7`). The fictional spec (`F-001`..`F-003`, `T-user`, `T-session`) is a typed
constant in `src/seed-data.ts`, not a table, until TK-41. It runs in a single transaction and
rolls back on error. It is idempotent and deterministic (fixed ids and `2026-01-01` timestamp,
no clock): rows are upserted by natural key (`(project, key)`, `(project, number)`), the
children of the six seeded tickets are deleted and re-inserted, counters use `GREATEST` (the
database trigger forbids lowering them) and tickets created outside the seed are never touched.
It overwrites any edit made to the seeded rows. **Never in production**: `seed()` throws before
opening any connection when `NODE_ENV=production`, with no bypass (a production database
reached with another `NODE_ENV` is not detected). Test: `packages/db/test/seed.test.ts`;
`root-scripts.test.ts` checks the root `db:seed` script. Demo emails use the reserved `.test`
domain. The same seed serves the e2e run; the active sprint means a sprint created by an e2e
must be `planned`, and new tickets start at `TK-7`.

Database rollback path: `pnpm db:rollback` undoes the latest migration (its `down.sql`,
then removal of its `_prisma_migrations` row). It is not transactional, so take a backup
first outside development. Whether CI runs the `@koklo/db` tests (they need Docker):
TO DOCUMENT.

### Spec batches: configuration and operation (TK-44b)
| Variable | Read by | Meaning |
|----------|---------|---------|
| `SPEC_BATCH_WAIT_MS` | api | optional integer from 1 to 60000 (default 8000): how long `specBatch.submit` waits for the worker to settle the batch before answering 200 with the batch still `queued` or `committing`; the client then polls `specBatch.get`. A non-integer, zero, negative or larger value fails the start, naming the variable and never the value. The database is read every 150 ms and no transaction is held during the wait |
| `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` | api, worker | same all-or-nothing pair and same decoding as in the API (one shared function in `@koklo/github`); neither set means the worker starts without a provider and every `spec-write` batch ends `failed` with `PROVIDER_UNAVAILABLE` |
| `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET` | api, worker | optional pair, only valid with the App (a client without `GITHUB_APP_ID` fails the start); not used by the commit path |

The worker needs the database and the GitHub App secrets of the API (the manifest wiring for the worker
is TK-47). The `spec-write` queue is created and tuned by the worker at startup (`key_strict_fifo`, 5
attempts in all with exponential back-off from 5 s, a job expires after 300 s); the API only sends to it,
so the worker must have started once before the first `submit` (otherwise `submit` answers `INTERNAL`
and a replay of the same key enqueues again). Workers can be scaled out: the policy serializes each
`repoId:branch` key across processes.

Operating signals: a batch stuck `committing` means the job died; pg-boss retries it, and the next
attempt finds the commit by its `Koklo-Ops` trailer instead of writing twice. A batch `failed` with
`INTERNAL` after a crash means the outcome is unknown (more than 50 commits since): check the branch for
the trailer by hand; the periodic sweep is TK-46. No job of the queue should ever sit in the `failed`
state, as it would block its branch (`SELECT count(*) FROM pgboss.job WHERE name = 'spec-write' AND
state = 'failed'` must be 0). Logs carry the batch id, the final status and the error code, never a
token, a provider message or an e-mail address.

### User token encryption key: `KOKLO_ENCRYPTION_KEY` (TK-48a1)
| Variable | Read by | Meaning |
|----------|---------|---------|
| `KOKLO_ENCRYPTION_KEY` | api | AES-256 key of the stored user tokens. Accepted formats: 32 alphanumeric characters (what the infra `generate` produces, read as 32 bytes) or canonical base64 of 32 bytes (`openssl rand -base64 32`); anything else fails the start naming the variable, never the value. Required when `GITHUB_APP_CLIENT_ID` and `GITHUB_APP_CLIENT_SECRET` are set (a token could not be kept otherwise); without client credentials and key, no user token is stored (`NoUserCredentials`) |

- Generated by the infra (`generate` in `.deploy/manifest.yaml`) and frozen by `lockedSecrets`: the
  value does not change between deployments. That the variable reaches the api service is to be
  confirmed at the first staging deployment.
- **Rotation makes stored tokens unreadable** (`TokenDecryptionError`): users must re-authorize.
  Each row stores `key_version`; a future rotation will decrypt with the old key by version. The
  procedure is not written yet.
- The key, tokens, OAuth codes and the client secret never appear in logs, errors or audit.
- The same key (HKDF label `installation-state`) signs the installation `state`: rotating it also
  invalidates the flows in progress (10 minutes at most). Without client credentials or key,
  `installation.start` answers `503 PROVIDER_UNAVAILABLE` and the callback `provider_error`.
- **Installation callback (TK-48a2)**: the App's Callback URL must be exactly
  `https://<web domain>/api/github/callback`; `BETTER_AUTH_URL` must be the public origin of the web
  (it builds the `redirect_uri` sent to GitHub). Each `start` purges the expired states of the
  organization and of the user; unconsumed states are capped at 20 per user across all organizations. The request log keeps the callback path
  only (no query) and masks the `Location` header.
- **GitHub App settings (NEEDS-HUMAN, per environment).** In the App settings, "Identifying and
  authorizing users": **Callback URL** `https://app-staging.koklo.dev/api/github/callback` (staging) or
  `https://app.koklo.dev/api/github/callback` (production), exactly, distinct from the Better Auth
  callback; tick **Request user authorization (OAuth) during installation**. With that box ticked the
  **Setup URL** becomes unavailable and is not used: the Callback URL finalizes the installation. The
  App's client ID and a client secret are stored as the infra secrets `GH_APP_CLIENT_ID` and
  `GH_APP_CLIENT_SECRET` (mapped to `GITHUB_APP_CLIENT_ID` / `GITHUB_APP_CLIENT_SECRET`, optional
  pair); without them `installation.start` answers `503 PROVIDER_UNAVAILABLE`. Never reuse the
  `OAUTH_GITHUB_CLIENT_*` pair, which belongs to the sign-in OAuth App.
- **Ownership proof (B1).** Linking requires the user to own the installed account: own personal
  account, or active admin of the GitHub organization (`GET /user`, then `GET /orgs/{org}/memberships/{username}`).
  `GET /user/memberships/orgs/{org}` is not open to GitHub App user tokens (403 "Resource not
  accessible by integration"). The App needs the organization permission **Members: Read-only**
  (App settings > Permissions & events > Organization permissions); an organization owner must
  accept the permission change on the existing installation. An organization that blocks the App answers 403, reported as `provider_error`. A
  refusal is the outcome `not_owner` (audit `installation.link_refused`). To check on a sandbox
  (NEEDS-HUMAN, with the ADR 0009 test): a member who is not admin of a test organization gets
  `not_owner`; an admin gets `installed`.
- **CSRF and session.** The callback is a browser GET: the `state` (HMAC, bound to user and
  organization, single use, 10 minutes) is the CSRF guard, and the session cookie (SameSite=Lax, sent on
  GitHub's top-level redirect) must belong to the same user, otherwise the outcome is `invalid_state`.
- **Reading a `provider_error` (callback diagnostic).** A `provider_error` redirect always leaves one
  log entry `installation callback failed` (level 40) with a closed set of fields and nothing else:
  `step`, `errorName`, optional `status`, optional `oauthError` and optional `denial`. Never the code, state, token,
  client secret, URL, error message or response body.

  | `step` | Meaning |
  | --- | --- |
  | `request` | Failure outside the named steps (session lookup, unexpected error) |
  | `consume_state` / `manager_check` / `target` | Database reads of the signed state, the role, the installation |
  | `exchange_code` | `POST github.com/login/oauth/access_token` (code to user token) |
  | `list_installations` | `GET /user/installations` with the new user token |
  | `owner_role` | `GET /user`, puis pour une organisation `GET /orgs/{org}/memberships/{username}` (ownership proof) |
  | `link` | Database transaction that links the installation (and its audit) |
  | `audit` | Writing the `link_refused` audit after a refusal (outcome is unchanged) |

  `status` is the HTTP status of the failing GitHub call (GitHub answers **200** with an `error` field on
  the token endpoint, so `status: 200` with an `oauthError` is a refused exchange). `oauthError` is kept
  only if it is one of GitHub's public OAuth codes (allow list in `@koklo/domain`, `OAUTH_ERROR_CODES`);
  any other value is dropped. Typical readings of `step: exchange_code`: `redirect_uri_mismatch` (the
  App's Callback URL differs from `<BETTER_AUTH_URL>/api/github/callback`),
  `incorrect_client_credentials` (wrong `GH_APP_CLIENT_ID` / `GH_APP_CLIENT_SECRET`),
  `bad_verification_code` (reused or expired code: reported as `denied`, not `provider_error`),
  `unauthorized_client`, `application_suspended`, `access_denied`. No `oauthError` with `status` 5xx:
  GitHub outage; with `status` 401 or 403 on a later step: user token or organization App policy.
  `denial` appears only on a 403 and is one of a closed set computed by the adapter from GitHub's
  message (never the text itself): `resource_not_accessible` ("resource not accessible by
  integration": the App lacks the permission, or the token is not allowed for that resource),
  `app_blocked` (message mentions "blocked"), `access_policy` ("access policy" / "third-party":
  the organization restricts third-party App access), `saml_enforcement` (SAML SSO authorization
  missing), `permission_missing` ("permission" / "must have"), `other`. Typical reading of
  `step: owner_role` with `status: 403`: `access_policy` or `app_blocked` means an organization
  owner must approve the App; `saml_enforcement` means the user must authorize the token for SSO.
  Example: `{"level":40,"step":"exchange_code","errorName":"GitProviderError","status":200,"oauthError":"redirect_uri_mismatch","msg":"installation callback failed"}`.
- **User token expiry.** With "Expire user authorization tokens" on (GitHub's default), the exchange
  response carries `expires_in` (8 h) and `refresh_token` (+ `refresh_token_expires_in`); the adapter
  stores both. A response without them (option off) is treated as valid for 8 h without refresh. The
  exchange sends `Accept: application/json`, `client_id`, `client_secret`, `code` and `redirect_uri`
  (optional on GitHub's side, but if sent it must equal the Callback URL, which it does).

### Spec reads: operation (TK-45c2)
`spec.head`, `spec.listFeatures` and `spec.getFeature` have no configuration. `spec.head` and
`spec.listFeatures` read only the index (no provider call, no audit entry); `spec.getFeature` makes one
`readFile` at the indexed SHA. `SPEC_INDEX_FAILED` (409, `errorCode` + `commitSha`) means the indexer
stored a `failed` snapshot (for example `spec_too_large`): fix the spec and push, the head then moves to
a new snapshot. After a commit through `specBatch`, `spec.head` lags until the push webhook is indexed.
The list is sorted in memory over the features of one snapshot (bounded by `spec_too_large`). Logs and
errors carry no token, provider message or file path.

### Webhook deliveries: configuration, retention and operation (TK-45b)
| Variable | Read by | Meaning |
|----------|---------|---------|
| `WEBHOOK_RETENTION_DAYS` | worker | optional integer from 1 to 365 (default 30): age after which a delivery is deleted, whatever its status. Anything else fails the start, naming the variable and never the value |

- **Purge.** The worker registers one pg-boss schedule, `17 3 * * *` in UTC, on the `webhook-purge`
  queue (a restart does not duplicate it). The job deletes the rows received before `now - retention`
  in batches of 1000 until none is left, and logs only counts. A delivery redelivered by the provider
  after its row was purged is processed again, which is safe because indexing is idempotent per commit.
- **Retention and personal data (GDPR).** Stored payloads are the **normalized** ones: no commit, author,
  e-mail or message, only identifiers, the ref, the commit ids and, for `installation`, the public
  account login. The row therefore holds no commit personal data and its life is bounded by the
  retention. A `deleted` installation also erases the other deliveries of that installation at once. The
  deliveries of a deleted organization have no `organization_id`: they disappear at the end of the
  retention, at most `WEBHOOK_RETENTION_DAYS` days later.
- **Signals.** Rows left `received` or `processing` (worker stopped, enqueue lost) are not swept yet:
  re-enqueueing them, with the same job id, is TK-46. A delivery `failed` carries a closed `error_code`
  (`SELECT error_code, count(*) FROM webhook_deliveries WHERE status = 'failed' GROUP BY 1`).
  `repo_not_found` means the repository itself is gone or no longer reachable by the installation
  (a missing branch alone is not an error: its head is removed and the delivery is `processed`);
  the heads are left as they were. No job of
  `webhook-delivery` should sit in the `failed` state (it would block its key):
  `SELECT count(*) FROM pgboss.job WHERE name = 'webhook-delivery' AND state = 'failed'` must be 0.
  Logs carry the delivery id, the event, the final status and the error code, never the payload, a
  token, a provider message or an account login. The worker reads no webhook secret: the signature is
  verified by the API (TK-45c1).

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
- **Project creation e2e (TK-48c)**: `apps/web/e2e/project-create.spec.ts` (fake API `e2e/support/stub-spec-repo.ts`,
  never github.com) plus `a11y.spec.ts`: 189 tests passed on a temporary copy of the repository (ports 3100/3101,
  `PLAYWRIGHT_CHANNEL=chrome pnpm --filter @koklo/web e2e -- e2e/project-create.spec.ts e2e/a11y.spec.ts`). The
  captures land in `design/screens/captures/S-projects/` and are copied back from the copy. A scenario change in
  the middle of a flow clears the fake API's created projects unless `keepProjects: true` is passed.
- **Features list e2e (TK-48d)**: `apps/web/e2e/features.spec.ts` (46 tests: 15 states x light/dark, 375 px list and sheet, navigation from `/projects` and the sidebar, route guard, 404 on a neighbouring path). Run after the Refactor step on a temporary copy of `apps/web` (ports 3100/3101, `PLAYWRIGHT_CHANNEL=chrome pnpm exec playwright test`) together with the whole stub-API suite (`a11y`, `project-create`, `projects`, `sidebar`, `organizations`, `github`, `kanban`, `login`, `accept-invitation`): 235 tests, 235 passed. Three test defects were fixed while doing so: axe now runs with the WCAG tags (`wcag2a`, `wcag2aa`, `wcag21aa`) like every other spec instead of the default rule set, whose `region` and `label-content-name-mismatch` findings belong to the sidebar template; under a modal sheet the h1 is looked up with `includeHidden`; the 375 px sheet width is measured after the slide-in animation settles. One real defect was fixed in the application: the scrollable body of the sheet had no keyboard access (axe `scrollable-region-focusable`); it is now a named, focusable region. Root real-stack e2e (`E2E_DB_PORT=54339 E2E_WEB_PORT=3290 E2E_API_PORT=3291 pnpm e2e`): 32 passed, including `organizations.spec.ts` and `projects.spec.ts`; no root test depends on the changed `/projects` rows or on the sidebar. Captures: `design/screens/captures/S-features/` (32 images). Captures of other screens regenerated by the same run are not committed (rendering noise only).
- **Feature form e2e (TK-48e-1)**: `apps/web/e2e/feature-form.spec.ts` (48 tests: 15 states x light/dark, `slow` and `saved-index-pending` on a simulated clock (`page.clock`), axe on every state, creation, edit with minimal patch, conflict, designer rule, role matrix, keyboard, reduced motion, 375 px, a single `role="status"` in the accessibility tree under the modal panel). Run after the Refactor step on a temporary copy of `apps/web` (ports 3110/3111 because 3101 was held by another session's fake API, which was left alone; `PLAYWRIGHT_CHANNEL=chrome pnpm exec playwright test`): `feature-form` 47 passed (+1 new test, passed), then `features`, `a11y`, `project-create`, `projects` 141 passed. Root real-stack e2e (`E2E_DB_PORT=54339 E2E_WEB_PORT=3290 E2E_API_PORT=3291 pnpm e2e`): 32 passed, no 48c-style regression; the script removed its own `koklo-e2e` containers and volume. Test defect fixed: the dark-theme states opened by URL (`?new=1`, `?edit=`) tried to click the user menu behind the modal panel, and `localStorage.clear()` ran again on every reload so `draft-resumed` lost its draft; the init script now clears storage once per test and sets the `koklo-theme` key before the first render. Application changes made while doing the Refactor step: the status region moves into the panel while it is open (screen readers could not reach it), the page keeps polling `spec.head` every 5 s for 2 minutes after a "list not up to date" notice even when the panel is closed, and the footer order is Save then Close both in the DOM and visually. Captures: `design/screens/captures/S-feature-form/` (32 images); captures of other screens regenerated by the same run are not committed (rendering noise only).
- **Feature deletion e2e (TK-48e-2)**: block `Suppression (48e-2)` and the `delete-confirm` states (light, dark, 375 px) of `apps/web/e2e/feature-form.spec.ts`: 17 tests. Run after the Refactor step on a temporary copy of `apps/web` (ports 3120/3121; 3101 was held by another session's fake API, left alone; `PLAYWRIGHT_CHANNEL=chrome pnpm exec playwright test`, copy and `pnpm-lock.yaml` change removed afterwards): block 17/17, then `feature-form` 65/65, `features` 46/46, `a11y` 44/44. Root real-stack e2e (`E2E_DB_PORT=54339 E2E_WEB_PORT=3290 E2E_API_PORT=3291 pnpm e2e`): 32 passed, `koklo-e2e` containers and volume removed by the script. Test defects fixed (not application defects): the confirmation title exists twice (a hidden full-text copy and a visible copy with the identifier in mono) so the test now targets the visible one; the 375 px test asked for buttons of at least 300 px while the icon column leaves 264 px, it now checks that the buttons fill their column (and 240 px at least). The `SPEC_INVALID` deletion test also checks the new wording. Application changes in the Refactor step: `SPEC_INVALID` of a deletion no longer says "Corrigez les points ci-dessous" (a reference blocks it, nothing to correct), footer extracted to `feature-form-footer.tsx`, save/retry/delete grouped in `useWriteActions`. Captures: `design/screens/captures/S-feature-form/delete-confirm-{light,dark,light-mobile}.png`; captures of other screens regenerated by the same run are not committed (rendering noise only).
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

**R2 stack (TK-49a, [ADR 0010](adr/0010-e2e-single-process-stack-fake-git-provider.md))**: `run.ts` starts
`e2e/scripts/stack.ts` instead of `apps/api/dist/main.js`. It runs the API and the worker in ONE process
sharing ONE `InMemoryGitProvider` (`nextId` is a numeric counter), injected with
`overrideProvider(GIT_PROVIDER)` and `startWorker(config, { gitProvider })`; no production file changes and
no variable can select the fake. It refuses to start when `APP_ENV` is `staging` or `production` (stderr
message, before any import, connection or port). `run.ts` adds fake `GITHUB_WEBHOOK_SECRET`,
`GITHUB_APP_ID/PRIVATE_KEY/CLIENT_ID/CLIENT_SECRET`, `KOKLO_ENCRYPTION_KEY` and `SPEC_BATCH_WAIT_MS=15000`.
The fake emits no webhook: tests post HMAC-signed `push` events through the web (`e2e/support/webhook.ts`);
the seeded installation (`e2e/support/installation.ts`) needs no prior declaration. Guard:
`packages/config/test/e2e-stack-guard.test.ts` (no production import of `@koklo/github/testing`; launcher
refuses `staging`/`production`). `e2e/` stays out of the Docker images (`.dockerignore`). Smoke tests:
`e2e/tests/r2-stack.spec.ts` (health, webhook bad signature 401, `installation.start` URL of the fake).
The real GitHub App proof stays manual.

**R2 journeys (TK-49b)**: `e2e/tests/r2-journeys.spec.ts` (8 tests, about 12 s of the 46 tests of `pnpm e2e`,
about 30 s of Playwright and about 1 min in all with a warm build cache) replays the R2 result of the vision
against the real API + worker + web + Postgres with the injected fake. Each test builds its own workspace
(`createR2Workspace()` in `e2e/support/r2-workspace.ts`: organization, seeded installation, owner, dev and
client sessions), so no test depends on another; waits are bounded `expect.poll` (15 s), never fixed sleeps.
Covered: T1 create a project from the UI (success status "Projet « X » et dépôt de spec créés.", `repo.list`
spec/new repo, `project_repos` row, second `createSpec` = 409); T2 before the signed push the page says "La
spec est en cours de préparation", after it (delivery `processed`, `spec.head` set, page reloaded) "Aucune
fonctionnalité pour le moment"; T3 bad signature 401 and one `webhook_deliveries` row for a replayed delivery
id; T4 a feature written from the UI gives a `committed` batch with a 40-hex `commitSha` and `F-001`; T5 the
next push indexes it (`spec.head.commitSha` = batch commit, the page lists the title: the index is rebuilt from
the repository files, indirect proof of the commit); T6 two writes give two distinct ordered commits
(`F-001`, `F-002`); T7 a read-only role (`client`) has no "Nouvelle fonctionnalité" button and gets 403 on
`specBatch.submit`, a `dev` writes; T8 install through the fake OAuth (`installation.start` state, callback
`code=fake-code-e2e-link-1` from the launcher pool, 303 to `/github?result=installed`, account listed, replay =
`invalid_state`). The pool `e2e-link-1..3` is single use per run: the database is new at every `pnpm e2e`.
The "Terminé" step badges of the creation panel are not asserted: the panel closes on full success (the stub
suite `apps/web/e2e/project-create.spec.ts` covers them). Run three times in a row on ports 54339/3290/3291:
46 passed each time.

### Reconciliation job (TK-46a)
| Variable | Read by | Meaning |
|----------|---------|---------|
| `RECONCILE_GRACE_MINUTES` | worker | optional integer from 5 to 1440 (default 15): minimum age of a delivery or batch before it is considered stuck. Anything else fails the start, naming the variable and never the value |
| `RECONCILE_MAX_PROVIDER_CALLS` | worker | optional integer from 10 to 5000 (default 300): maximum git provider calls (authentication included) of the spec-heads pass per run. Anything else fails the start, naming the variable and never the value |

- **Schedule.** `*/10 * * * *` in UTC on the `reconcile` queue, registered once. Only one tick runs at a
  time (advisory lock); a skipped tick logs `skipped: already_running`.
- **Repairs.** P1 requeues `received`/`processing` deliveries and P2 requeues `queued`/`committing`
  spec-write batches that have no live job, with a new job id and the same singleton key, after
  deleting the `failed` jobs of that key (which would block it). Each pass handles at most 200 rows per
  tick. Each relaunched batch gets a system audit entry `spec_write_batch.requeued`.
- **P3 (TK-46b).** An `in_review` ticket whose pull request (URL in `Ticket.pullRequest`) was merged by
  hand at the provider becomes `done`, its open leases are released and a system audit entry
  `ticket.reconcile.pr_merged` is written. A pull request closed without merge changes nothing and
  leaves one `ticket.reconcile.pr_closed` entry. At most 200 provider reads per run; without a
  provider configured the pass does nothing.
  Rotation (no migration): tickets are scanned by increasing id; when the cap is reached, the next
  run resumes after the last ticket handled and wraps to the start at the end of the list, so every
  `in_review` ticket is read within ceil(N/200) ticks and none is starved. The cursor lives in the
  worker process memory; losing it at restart only restarts the scan from the first ticket. Merged
  tickets are not prioritised (that would need an extra read or a marker).
  Known limit: tickets whose pull request is closed without merge are read again at every pass
  over the list (the `pr_closed` audit is deduplicated, `closed` is recounted; unreadable
  references cost no provider call and no cap). Closed ones must be re-read since the pull request
  can be reopened and merged later. `last_reconciled_at` (P4) is not used by P3: the marker is per repo, not per pull request.
  A provider rate limit (`rate_limited` reason) stops the pass; the ticket is read again on the
  next run. Provider errors are logged by class name (`errorName`) only, never the message.
- **Monitoring.** The tick log carries `deliveries`, `batches` (`requeued`, `skipped`), `prs` (`done`,
  `closed`, `skipped`, `reasons`: counts per reason such as `pr_ref_unparsable`, `repo_not_linked`,
  `provider_error`), `failedPasses` and `durationMs`. A non-empty `failedPasses` on several consecutive ticks means a pass is broken
  (the error class name is logged as `errorName`, never the message). Steady non-zero `requeued` means
  jobs are being lost upstream. Check the `failed` jobs whose row is still unsettled (a settled row is not repaired, so a
  bare count of `failed` jobs would stay above 0 forever):
  `SELECT count(*) FROM pgboss.job j LEFT JOIN webhook_deliveries d ON d.id::text = j.data->>'deliveryId' LEFT JOIN spec_write_batches b ON b.id::text = j.data->>'batchId' WHERE j.state = 'failed' AND ((j.name = 'webhook-delivery' AND d.status IN ('received','processing')) OR (j.name = 'spec-write' AND b.status IN ('queued','committing')))`
  should return to 0 within one tick.
- **P4 (TK-46c).** For each spec-bearing repo (role `spec` or a `spec_path`) of an `active` installation,
  re-indexes the default branch and the known heads, so a lost `push` webhook or a deleted branch is
  repaired within a few ticks. Audits `repo.reconcile.head_updated`, `head_removed` (repo checked by
  `getRepo`) and `unreachable` (repo 404: heads kept, one entry ever); nothing is written when the state
  is unchanged. The tick log carries `heads` (`updated`, `removed`, `unreachable`, `skipped`, `stopped`).
  Rotation and budget: repos go by oldest `last_reconciled_at` first (never reconciled first), one at a
  time, and at most `RECONCILE_MAX_PROVIDER_CALLS` provider calls per run (authentication included). The
  repo is marked reconciled only when finished (an unreachable repo counts as finished), never when
  interrupted by the budget or a rate limit, so it is resumed first on the next tick: with N repos and
  a budget B every repo is served within a few ticks. A repo failing with a provider error is `skipped`
  and goes behind the healthy repos on the following runs (process memory), so one broken repo does not
  starve the others.
  Known limits: a repo that alone needs more calls than the budget stays interrupted (keep the budget
  at 300 or more); the failing-repo memory is lost at restart; P3 and P4 budgets are separate; a `stopped`
  value of `budget` on many consecutive ticks means raising `RECONCILE_MAX_PROVIDER_CALLS` or fewer
  repos per tick; `skipped` steadily above 0 means a repo that the provider refuses (permissions,
  suspended app): see the worker logs (`errorName`).

### R1 journey (TK-36)

`e2e/tests/r1.spec.ts` (serial, 5 tests, about 4 s) replays the R1 result of the vision against the
real stack. It runs in its own workspace, `createR1Workspace()` (`e2e/support/r1-workspace.ts`): an
organization with a per-run slug `r1-<uuid8>`, its project, one owner and two `dev` members, each with
a real signed session (shared helpers in `e2e/support/db.ts`). The seed is neither read nor changed, so
the sprint created by the test is `SP-1` of that project and cannot collide with `kanban.spec.ts`.

The 5 tests prove, in order:

1. a sprint is created (`planned`), activated (`active`), and a second activation is refused (409);
2. tickets A and B (todo) and C (backlog) exist, with B depending on A (`dependency.list`);
3. in the browser kanban, C moves backlog to todo, B to "En cours" is refused (alert, stays in todo, server
   agrees), A goes todo, in progress, in review, done, then B moves; a reload proves persistence;
4. two devs acquiring the lease in parallel get exactly one 200 and one 409 `LEASE_HELD`;
5. `audit.list` holds the expected entries (lease, sprint, ticket, dependency, transitions).

The spec passes on the real code, so its failing proof is by mutation; each of these turns it red
(verified, then reverted): disabling the dependency check in `ticket.service.ts` (test 3), dropping the
partial unique index `leases_active_ticket_key` (test 4, two leases granted), and breaking the
`LEASE_HELD` mapping in the lost-race path (test 4, 500 `INTERNAL` instead of 409).

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

## Real GitHub conformance (TK-39)
`pnpm --filter @koklo/github test:real` runs the shared `GitProvider` conformance suite against
real GitHub, by hand only. It refuses to start (exit 1, missing variables listed) unless the
10 `KOKLO_GH_*` variables are set (template: `packages/github/.env.real.example`; the real
`.env.real` is git-ignored). Repositories are named `koklo-sandbox-<timestamp>-...` in the test
organisation; they are deleted at the end only if the test App has the Administration
(write) permission, otherwise delete them by prefix. Full procedure and App permissions:
`packages/github/README.md`.
