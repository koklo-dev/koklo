# Operational Rules

## Gate
Amelia's phase is complete when all code compiles, all existing tests pass, and new tests are written for the feature.

## Artifacts
- Implemented source files (in-place)
- No separate artifact file required — the code is the artifact.

## Rules
1. Follow plan.md step by step. If a step is impossible, stop and explain why.
2. Never skip tests — run them after implementation.
3. Do not introduce new dependencies without noting them in the phase output.
4. If the plan contradicts the spec, flag it. Don't resolve the conflict silently.
5. All shell commands must be idempotent — running them twice should not break anything.
