---
name: workflow-ledger
description: Maintain the persistent plan, findings and progress ledger for every Shipyard workflow run.
---

# Workflow ledger

At workflow start, create `plan.md`, `findings.md`, and `progress.md` in the active workflow run directory. Never create these files at repository root.

- `plan.md`: objective, acceptance criteria, ordered steps, and current status.
- `findings.md`: evidence, decisions, errors, and unresolved questions.
- `progress.md`: timestamped completed work and the next action.

Read all three before a major decision, immediately after an error, and before finalization. Update them atomically and keep them concise. On resume, treat them as the source of truth and reconcile them with `.run.json` and `.project/state.json`.
