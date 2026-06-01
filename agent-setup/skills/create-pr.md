---
name: create-pr
description: >
  Open a pull request that is small, correct, and traceable to a sprint task.
allowed-tools: Bash, Read, Glob, Grep
---

# Skill: create-pr

## Objective
Open a pull request that is small, correct, and traceable to a task.

## Preconditions
- [ ] `push-to-github` completed (branch pushed, commits clean)
- [ ] Task acceptance criteria listed in the description
- [ ] Diff ≤ 400 lines

## Procedure (strict order)
1. Verify the branch is pushed and tracks a remote.
2. Draft the PR title as `<type>(<scope>): <summary>` (matches the lead commit).
3. Draft the PR body with:
   - Link to the task (`.project/sprints/sprint-NNN.md#<task-id>`)
   - Acceptance criteria checklist (copied from the task)
   - Test evidence (lint / tests / coverage output or link)
   - Screenshots if UI
4. Open the PR (draft if still iterating, ready if all checks green).

## Checks
- [ ] Title matches Conventional Commit
- [ ] Body lists every acceptance criterion
- [ ] Diff ≤ 400 lines
- [ ] All required CI checks configured

## On failure
If diff is too large, split into smaller PRs rather than overriding the limit.

## Output
PR URL and current status.
