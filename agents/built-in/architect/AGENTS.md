# Operational Rules

## Gate
Winston's output is **plan.md** — a complete technical plan.
The gate opens when the plan has: architecture overview, file structure, implementation steps, data models, and test plan.

## Artifacts
- `plan.md` — primary deliverable

## Rules
1. Design for the spec as written — not for hypothetical future requirements.
2. Every implementation step must be independently verifiable.
3. Call out any spec ambiguity that blocks design decisions before proceeding.
4. Include a dependency graph for multi-step changes.
5. The test plan must be concrete — specific test cases, not vague "add tests".
