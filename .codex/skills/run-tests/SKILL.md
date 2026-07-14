---
name: run-tests
description: >
  Run the full test suite with coverage; block on failure or coverage below spec.
  Supports expect-fail mode for TDD red-phase proof, and expect-pass mode for green/refactor phases.
allowed-tools: Bash, Read
---

# Skill: run-tests

## Objective
Run the full test suite with coverage; block on failure or coverage below spec.

## Modes
- `expect-pass` (default) — normal gate: all tests must pass, coverage must meet thresholds.
- `expect-fail` — TDD red-phase proof: run only the newly added test(s) and require them to **fail**. Used exclusively by `test-writer` before any implementation exists.

## Preconditions
- [ ] Dependencies installed
- [ ] No syntax errors (lint passed if available)

## Procedure (strict order)

### expect-pass (default)
1. Run tests with coverage: `cargo test --workspace`
2. Parse coverage output from `bash scripts/coverage.sh`.
3. Compare against `agent-setup/spec/engineering-standards.md` thresholds (overall ≥ 80%, new code ≥ 90%).

### expect-fail (TDD red phase only)
1. Run only the new test(s): `cargo test --workspace` scoped to the new test file/name.
2. Confirm the run reports a **failure**, not an error unrelated to the missing behavior (e.g. reject a bare import/syntax error as inconclusive — fix the test file and re-run).
3. Capture the verbatim failure output for the stage artifact (`03a-red.md`).
4. If the test passes on this first run, stop — the behavior already exists or the test is vacuous; do not proceed to implementation.

## Checks (expect-pass)
- [ ] All tests pass
- [ ] Overall line coverage ≥ 80%
- [ ] Overall branch coverage ≥ 70%
- [ ] New-code line coverage ≥ 90%

## Checks (expect-fail)
- [ ] The targeted new test(s) fail
- [ ] The failure is attributable to missing behavior, not a syntax/import error
- [ ] Failure output captured verbatim

## On failure
`expect-pass`: report failing tests + coverage gaps. Do not commit.
`expect-fail`: if the test unexpectedly passes, report it as `[BLOCKING]` and do not hand off to the developer.

## Output
Test summary + coverage report location (`expect-pass`), or verbatim failure output (`expect-fail`).
