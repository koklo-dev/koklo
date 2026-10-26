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
TO DOCUMENT — install, run, test, and the smallest useful change with the exact
commands, so they can be copy-pasted.

## Conventions that are not obvious from the code
TO DOCUMENT — naming, layering rules, what must never be done here, and why.

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
