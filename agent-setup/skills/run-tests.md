---
name: run-tests
description: >
  Run the full test suite with coverage; block on failure or coverage below spec.
allowed-tools: Bash, Read
---

# Skill: run-tests

## Objective
Run the full test suite with coverage; block on failure or coverage below spec.

## Preconditions
- [ ] Dependencies installed
- [ ] No syntax errors (lint passed if available)

## Procedure (strict order)
1. Run tests with coverage: `cargo test --workspace`
2. Parse coverage output from `TO CLARIFY`.
3. Compare against `agent-setup/spec/engineering-standards.md` thresholds (overall ≥ 80%, new code ≥ 90%).

## Checks
- [ ] All tests pass
- [ ] Overall line coverage ≥ 80%
- [ ] Overall branch coverage ≥ 70%
- [ ] New-code line coverage ≥ 90%

## On failure
Report failing tests + coverage gaps. Do not commit.

## Output
Test summary + coverage report location.
