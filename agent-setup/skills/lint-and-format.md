---
name: lint-and-format
description: >
  Run the project's linter and formatter; block on failure.
allowed-tools: Bash, Read
---

# Skill: lint-and-format

## Objective
Run the project's linter and formatter; block on failure.

## Preconditions
- [ ] Working tree has the files to check (staged or all)

## Procedure (strict order)
1. Run format (auto-fixing): `cargo fmt --all`
2. Run lint: `cargo fmt --all -- --check; cargo clippy --all-targets --all-features -- -D warnings; pnpm run lint; pnpm run typecheck`
3. If either step exits non-zero, STOP.

## Checks
- [ ] Lint exit 0
- [ ] Format exit 0
- [ ] No new files produced outside the task scope

## On failure
Report the failing files + rule IDs. Do not auto-commit fixes beyond what the formatter changed.

## Output
Lint / format exit codes and any file modifications.
