<!-- generated-by: /init-project -->
---
tags: [workflow/definition, workflow/analyze-design-dev-review]
parent: "[[_README]]"
---
# Workflow: Analyze -> Design -> Dev -> Review

## Mode
orchestrated

## Used by
<!-- Auto-appended by `sprint` / `run-workflow` when this workflow is triggered. -->
<!-- - [[sprints/sprint-NNN#US-XXX]] — YYYY-MM-DD → [[workflows/runs/<run-id>]] -->
- [[sprints/sprint-003#US-007]] — 2026-06-13 → [[workflows/runs/analyze-design-dev-review-20260613134144]]
- [[sprints/sprint-006#US-013]] — 2026-06-14 → [[workflows/runs/analyze-design-dev-review-20260614000024]]
- [[sprints/sprint-008#US-017]] — 2026-06-14 → [[workflows/runs/analyze-design-dev-review-20260614092613]] (failed)
- [[sprints/sprint-008#US-017]] — 2026-06-14 → [[workflows/runs/analyze-design-dev-review-20260614132410]] (passed)
- [[sprints/sprint-009#US-018]] — 2026-06-14 → [[workflows/runs/analyze-design-dev-review-20260614194018]] (passed)
- ad hoc: custom title bar / frameless chrome — 2026-06-18 → [[workflows/runs/analyze-design-dev-review-20260618135343]] (passed)

## Stage 1 - Analyze
Agent: [[agents/product-owner/agent|product-owner]]
Inputs:
- Task record from sprint or ad hoc request
- `.project/vision.md`
- Acceptance criteria
Outputs:
- `.project/workflows/<run-id>/01-analyze.md`
Pass:
- Scope is clear
- Acceptance criteria are testable
- Missing product questions are listed
OnFailure:
- Stop and report unresolved scope gaps

## Stage 2 - Design
Agent: [[agents/designer/agent|designer]]
Inputs:
- `.project/workflows/<run-id>/01-analyze.md`
- UI or UX constraints from the vision
Outputs:
- `.project/workflows/<run-id>/02-design.md`
Pass:
- Proposed design fits the analyzed scope
- UX risks or non-UI skip decision are explicit
OnFailure:
- Stop and return to Stage 1 if the problem framing changed

## Stage 3 - Implement
Agent: [[agents/developer/agent|developer]]
Inputs:
- `.project/workflows/<run-id>/01-analyze.md`
- `.project/workflows/<run-id>/02-design.md`
- `agent-setup/spec/engineering-standards.md`
Outputs:
- `.project/workflows/<run-id>/03-implement.md`
Pass:
- Code changes are described
- Tests and quality gates are run or explicitly blocked
- Coverage impact is stated
- Active refactoring honored on touched files (no new duplication or dead code; file size within language target or split per §9)
OnFailure:
- Stop and document the blocking engineering issue

## Stage 4 - Review
Agent: [[agents/qa-reviewer/agent|qa-reviewer]]
Inputs:
- `.project/workflows/<run-id>/03-implement.md`
- Acceptance criteria
Outputs:
- `.project/workflows/<run-id>/04-review.md`
Pass:
- Every acceptance criterion is verified or rejected explicitly
- Blocking defects are listed separately from advisories
OnFailure:
- Stop and send the task back to implementation with the blocking findings

## Finalization
Agent: [[agents/tech-lead/agent|tech-lead]]
Inputs:
- `.project/workflows/<run-id>/04-review.md`
Outputs:
- `.project/workflows/<run-id>/final-summary.md`
Pass:
- Final verdict is unambiguous
- Next action is explicit
OnFailure:
- Stop and request clarification from the user
