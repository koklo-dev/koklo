---
name: push-to-github
description: >
  Stage, commit, and push changes for this project using node quality gates.
  Overrides the global agnostic push-to-github skill with stack-specific commands.
allowed-tools: Bash, Read, Glob, Grep
---

# push-to-github (project override — node)

This is a project-level override of the global `push-to-github` skill.
It applies the node-specific quality gates for this repository.

## Workflow
1. `git status --short` — identify changed files.
2. `git rev-parse --abbrev-ref HEAD` — confirm not on a protected branch.
3. Group changes into Conventional Commit groups.
4. Run lint: `pnpm lint` (blocking).
5. Run tests: `pnpm test` (blocking).
6. Run build: `pnpm build` (blocking).
6b. Run commitlint: `.github/scripts/commitlint-local.sh` (blocking) — same version and config as the CI `commitlint` job; it checks every commit of `origin/develop..HEAD`. Fix a bad message with a new commit only if the rules allow, otherwise ask; never push a branch that fails it.
7. If a manifest or lockfile changed, run the dependency audit: `TO CLARIFY` (blocking).
8. `git add <files>` + `git commit -m "type(scope): summary"`.
9. Final gate rerun: lint + tests + build.
10. `git push origin <current-branch>`.

## Quality Gates
These are the gates CI runs. Anything green here and red in CI is a gap in this
list — fix the list, not the CI.

- Lint: `pnpm lint`
- Format: `TO CLARIFY`
- Tests: `pnpm test`
- Build: `pnpm build`
- Commit messages: `.github/scripts/commitlint-local.sh` (the CI `commitlint` job; subject must be lower-case, no sentence-case).
- Dependency vulnerabilities: `TO CLARIFY` — required whenever a manifest or a
  lockfile is touched. The scan covers the whole resolved tree, so a transitive
  dependency you never named can fail it. A repository often runs several
  dependency gates with **different scopes**, and passing one proves nothing about
  the other; `dependency-audit.md` holds the mapping.

The autonomous delivery loop replays these same commands against the worktree
before it publishes a branch, reading them from `.stack_profile.commands` in
`.project/state.json` (overridable per deployment with `SHIPYARD_GATE_<KEY>`).
Keep the two in step: a gate listed here but absent there is never enforced, and a
gate enforced there but missing here is a review round nobody saw coming.

## Commit Rules
- Conventional Commit format: `type(scope): summary`
- Scope must match `[a-zA-Z0-9-_]+`
- Never amend existing commits
- Never use `--no-verify`

## On failure
Report the failing command, key error lines, and fixes attempted. Do not push.
