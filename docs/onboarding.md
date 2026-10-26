---
title: Onboarding — humans and AI agents
audience: technical
doc_version: 0.1.0
status: draft
last_reviewed: 2026-10-26
covers_release: unreleased
sources: []
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
pnpm dev         # turbo run dev
pnpm e2e         # turbo run e2e (no workspace defines this task yet)
```

Layout and shared configuration (`packages/config`): see
[architecture.md](architecture.md#monorepo-workspace-tk-1). Running a task for one
package: `pnpm --filter @koklo/config test`. The smallest useful change at this stage
is a rule or threshold tweak in `packages/config`, proven by its Vitest tests.

## Conventions that are not obvious from the code
- Quality limits are defined once, in `packages/config/biome.json`: functions of at
  most 50 lines, cognitive complexity at most 15, no explicit `any`. Do not override
  them per package; split the code instead.
- `packages/config/fixtures/` holds deliberately 50- and 51-line functions that prove the
  line limit; the root Biome config ignores that folder. Do not "fix" the 51-line one.
- TypeScript is `strict` with `noUncheckedIndexedAccess`; extend
  `@koklo/config/tsconfig.base.json`.
- The layout decision is recorded in
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
