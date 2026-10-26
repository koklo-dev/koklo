---
title: Onboarding — humans and AI agents
audience: technical
doc_version: 0.1.0
status: draft
last_reviewed: 2026-10-26
covers_release: unreleased
sources: []
covers_commit: 3c63a2c
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

### CI
- The required check is the job named `ci`; do not rename it. Jobs, path filters
  and coverage thresholds: [quality-and-operations.md](quality-and-operations.md#quality-gates).
- Reproduce the coverage gate locally: `bash .github/scripts/check-coverage.sh --require-reports .`
  once the tests have produced `coverage/coverage-summary.json` files.
- After changing a script in `.github/scripts/`, run its self-test:
  `bash .github/scripts/<name>.test.sh`.
- A change under `shipyard/skills/` must be re-published to `.claude/skills/`
  and `.codex/skills/`, otherwise the `skills in sync` job fails.

## Current work and open threads
TO DOCUMENT — active sprint focus, known debt, deliberate shortcuts.
