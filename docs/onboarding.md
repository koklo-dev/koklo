---
title: Onboarding — humans and AI agents
audience: technical
doc_version: 0.1.0
status: draft
last_reviewed: 2026-10-27
covers_release: unreleased
sources: []
covers_commit: ade3f4d
---
# Onboarding — humans and AI agents

Read this file first. It exists so that a developer, or an AI agent with no
prior context, can become productive on this project without asking anyone.

## What this project is
TO DOCUMENT — one paragraph: purpose, users, current state.

## Where things are
| Concern | Location |
|---------|----------|
| Architecture | [architecture.md](architecture.md) |
| Domain model | [domain-model.md](domain-model.md) |
| API contract | [api-contract.md](api-contract.md) |
| Quality and operations | [quality-and-operations.md](quality-and-operations.md) |
| Decisions (ADR) | [decisions/](decisions/) |
| Functional documentation | [functional/](functional/) |
| Change history | [changelog/reports/](changelog/reports/) |

## Getting productive
Prerequisites: Node 24 (`nvm use` reads `.nvmrc`) and pnpm at the version pinned by
`packageManager` in `package.json` (Corepack picks it up).

```bash
pnpm install --frozen-lockfile
pnpm lint        # turbo run lint  (biome ci)
pnpm typecheck   # turbo run typecheck
pnpm test        # turbo run test  (vitest run --coverage)
pnpm build       # turbo run build
pnpm dev         # Postgres (Compose) + web :3000 + api :3001 + worker (e2e/scripts/dev.ts)
pnpm e2e         # real-stack e2e (TK-15): Compose Postgres, migrate, seed, build, api+web, Playwright (needs Docker + Chromium)
pnpm db:migrate  # prisma migrate deploy (needs DATABASE_URL)
pnpm db:rollback # undo the latest migration through its down.sql
pnpm db:seed     # deterministic demo data (needs DATABASE_URL), safe to re-run
```

Local database (TK-7): `docker compose up -d postgres` at the root (set `KOKLO_DB_PORT`
if 5432 is taken), then `cp packages/db/.env.example packages/db/.env`. The `@koklo/db`
tests need Docker (or `TEST_DATABASE_URL`) and fail rather than skip without it.

Running the worker (`apps/worker`, TK-12): it needs a PostgreSQL reachable through
`DATABASE_URL` (the process exits at startup without it). `pnpm --filter @koklo/worker dev`
runs `node --watch src/main.ts`; `pnpm --filter @koklo/worker build` then `start` runs
`dist/main.js`. Its integration test starts its own PostgreSQL 17 through Testcontainers,
so **Docker must be available** to run `pnpm test` for that package. See
[architecture.md](architecture.md#worker-pg-boss-and-noop-job-tk-12).

Layout and shared configuration (`packages/config`): see
[architecture.md](architecture.md#monorepo-workspace-tk-1). Running a task for one
package: `pnpm --filter @koklo/config test`. The smallest useful change at this stage
is a rule or threshold tweak in `packages/config`, proven by its Vitest tests.

## Conventions that are not obvious from the code
- UI tokens (TK-13): never hard-code a colour or a font in an app. Use the variables of
  `packages/ui` (read `DESIGN.md` first). The "to confirm" values (`--primary`, `--ring`,
  `--destructive`, `--destructive-foreground`) live only in
  `packages/ui/src/styles/tentative.css`. Fonts are self-hosted through Fontsource: never
  add a Google Fonts link. See [architecture.md](architecture.md#ui-foundations-tk-13).
- UI components and icons (TK-84): import from `@koklo/ui` only, never from a sub-path, and
  never from `lucide-react` (Biome and a test reject it). Use `<Icon name="…" />`; to add an
  icon, add its name to `ICON_NAMES` in `packages/ui/scripts/generate-icons.ts`, run
  `pnpm --filter @koklo/ui icons:generate` and commit the generated files. An icon-only button
  is an `IconButton` with a mandatory `aria-label`; a status is a `StatusBadge` with a label.
  See [architecture.md](architecture.md#ui-components-and-icons-tk-84).
- Quality limits are defined once, in `packages/config/biome.json`: functions of at
  most 50 lines, cognitive complexity at most 15, no explicit `any`. Do not override
  them per package; split the code instead.
- `packages/config/fixtures/` holds deliberately 50- and 51-line functions that prove the
  line limit; the root Biome config ignores that folder. Do not "fix" the 51-line one.
- TypeScript is `strict` with `noUncheckedIndexedAccess`; extend
  `@koklo/config/tsconfig.base.json`.
- Every new package declares its boundary tag in its own `turbo.json`
  (`{ "extends": ["//"], "tags": ["<name>"] }`, name from vision §16.2) and imports
  other packages only through their declared `exports`, never `pkg/src/...`. An
  untagged package escapes the rules. `pnpm lint` enforces both; details in
  [architecture.md](architecture.md#package-boundaries-tk-3) and
  `packages/config/README.md`.
- Changing the API contract (`packages/contract`) means bumping the version in
  `package.json` **and** `src/version.ts`, then running
  `pnpm --filter @koklo/contract openapi:generate` and committing
  `openapi/openapi.json` and `openapi/versions.json`; otherwise the contract test fails
  (see [api-contract.md](api-contract.md#compatibility-and-breaking-changes)). Never edit
  those two files by hand. oRPC is pinned to a v2 beta on purpose.
- Every Prisma migration in `packages/db/prisma/migrations/` ships a `down.sql`, generated
  **before** `migrate dev`; procedure in `packages/db/README.md` and
  [domain-model.md](domain-model.md#persistence-and-migrations). Never edit
  `packages/db/src/generated/` (git-ignored, produced by `pnpm --filter @koklo/db generate`).
- `apps/api` is run with `cp apps/api/.env.example apps/api/.env` then `pnpm --filter @koklo/api dev`. Since TK-11 it refuses to start without `BETTER_AUTH_SECRET` (32+ characters, `openssl rand -base64 32`), `BETTER_AUTH_URL`, `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`: `BETTER_AUTH_URL` is the public URL of the web (the API is not exposed): create a GitHub OAuth App per environment with the callback `<BETTER_AUTH_URL>/api/auth/callback/github`, i.e. on the web origin, and never commit the secrets. With `APP_ENV=test`, the header `x-test-session: <userId>:<organizationId>` replaces the cookie (see [api-contract.md](api-contract.md#authentication-and-authorization)). Its integration tests start a throwaway Postgres through Docker (or use `TEST_DATABASE_URL`).
- Decisions: [ADR 0002](adr/0002-project-port-in-api.md), [ADR 0003](adr/0003-better-auth-session-guard.md); the layout decision is recorded in
  [ADR 0001](adr/0001-monorepo-pnpm-turborepo.md).
- Other conventions: TO DOCUMENT.

## Commits, releases and dependency updates
- Commits must follow Conventional Commits (enforced by the `commitlint` workflow);
  Release Please derives versions and `CHANGELOG.md` from them.
- PR titles are linted too, not only commits (see
  [quality-and-operations.md](quality-and-operations.md#conventional-commits-commitlintyml)).
- Trivy (`security` workflow) fails PRs on fixable HIGH/CRITICAL dependency
  vulnerabilities and committed secrets. `.github/fixtures/trivy-vulnerable` is a
  deliberately vulnerable fixture that proves the gate works: do not fix or delete it.
- Tickets are normally delivered by the autonomous loop in `.project/loop/`
  (`make loop-status|logs|stop|restart`, see `.claude/CLAUDE.md`); how it works is in
  [quality-and-operations.md](quality-and-operations.md#delivery-loop).
- Never edit `.release-please-manifest.json` by hand; the release PR updates it.
- Dependabot PRs arrive weekly (npm, GitHub Actions, Docker). Details in
  [quality-and-operations.md](quality-and-operations.md#release-and-dependency-automation-tk-6).

## Current work and open threads
TO DOCUMENT — active sprint focus, known debt, deliberate shortcuts.

`pnpm dev` needs `apps/api/.env` for `BETTER_AUTH_SECRET` and `GITHUB_CLIENT_*` (see its
`.env.example`); `DATABASE_URL`, `PORT` (3001), `BETTER_AUTH_URL` (the public URL of the web, `http://localhost:3000`) and the
web `API_INTERNAL_URL` get defaults aligned on `KOKLO_DB_PORT` / `KOKLO_API_PORT`, and any variable already exported wins.
