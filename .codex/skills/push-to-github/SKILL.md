---
name: push-to-github
description: >
  Stage, commit, and push changes for this project using Rust workspace + Tauri 2 desktop + TypeScript/React pnpm workspace quality gates.
  Overrides the global agnostic push-to-github skill with stack-specific commands.
allowed-tools: Bash, Read, Glob, Grep
---

# push-to-github (project override — Rust workspace + Tauri 2 desktop + TypeScript/React pnpm workspace)

This is a project-level override of the global `push-to-github` skill.
It applies the Rust workspace + Tauri 2 desktop + TypeScript/React pnpm workspace-specific quality gates for this repository.

## Workflow
1. `git status --short` — identify changed files.
2. `git rev-parse --abbrev-ref HEAD` — confirm not on a protected branch.
3. Group changes into Conventional Commit groups.
4. Run lint: `cargo fmt --all -- --check; cargo clippy --all-targets --all-features -- -D warnings; pnpm run lint; pnpm run typecheck` (blocking).
5. Run tests: `cargo test --workspace` (blocking).
6. If UI files changed (`.tsx`, `.vue`, `.jsx`, `.html`, `.css`, `.scss`) and Impeccable is installed, run design gate (see below).
7. `git add <files>` + `git commit -m "type(scope): summary"`.
8. Final gate rerun: lint + tests.
9. `git push origin <current-branch>`.

## Quality Gates
- Lint: `cargo fmt --all -- --check; cargo clippy --all-targets --all-features -- -D warnings; pnpm run lint; pnpm run typecheck`
- Format: `cargo fmt --all`
- Tests: `cargo test --workspace`
- Design (UI projects only): `npx impeccable detect` — run when Impeccable is installed and UI files are in the changeset

## Design Gate
Run only when **all** of these are true:
- `npx impeccable detect --version` exits 0 (Impeccable installed)
- The changeset contains at least one file matching `*.tsx`, `*.vue`, `*.jsx`, `*.html`, `*.css`, or `*.scss`

```bash
npx impeccable detect
```

On any `[critical]` finding: block the push, report findings. Advisory findings: report but do not block.

## Commit Rules
- Conventional Commit format: `type(scope): summary`
- Scope must match `[a-zA-Z0-9-_]+`
- Never amend existing commits
- Never use `--no-verify`

## On failure
Report the failing command, key error lines, and fixes attempted. Do not push.
