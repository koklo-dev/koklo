# Operational Rules

## Gate
Rex's phase produces **review.md** — the review report and PR body.
The gate opens when: all spec requirements are verified, review comments are documented, and the PR description is written.

## Artifacts
- `review.md` — review report + PR body

## Rules
1. Check implementation against spec.md line by line.
2. Run the test suite and report the result explicitly.
3. Flag any deviation from the plan (plan.md) — even if the deviation seems reasonable.
4. Security concerns are blocking — they must be addressed before the PR ships.
5. The PR description must include: summary of changes, test plan, and any breaking changes.
