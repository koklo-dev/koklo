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
- Commits **and pull request titles** follow Conventional Commits; the
  `commitlint` check fails otherwise (see [quality-and-operations.md](quality-and-operations.md)).
- Never modify or bump `.github/fixtures/trivy-vulnerable/`: its vulnerable
  `minimist` 1.2.5 lockfile is the test of the Trivy gate.
- Other conventions (naming, layering): TO DOCUMENT.

## Current work and open threads
TO DOCUMENT — active sprint focus, known debt, deliberate shortcuts.
