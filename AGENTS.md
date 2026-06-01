<!-- generated-by: /init-project -->
<!-- vars: PROJECT_NAME, STACK_DETAILS, ARCHITECTURE_STYLE, LINT_CMD, FORMAT_CMD, TEST_CMD, BUILD_CMD, DEV_CMD -->
# AGENTS.md — koklo

This repository uses a multi-agent workflow for Codex CLI sessions.

## Project
- Name: koklo
- Vision: `/home/devops/perso/projets/MyVault/Dev/koklo/vision.md` (source of truth, never auto-edit)
- State: `.project/state.json`
- Engineering spec: `/home/devops/perso/projets/MyVault/Dev/koklo/spec/engineering-standards.md`
- Workflow artifacts: `/home/devops/perso/projets/MyVault/Dev/koklo/workflows/runs/`

## Stack
- Cargo workspace with apps/cli and apps/desktop/src-tauri plus Rust crates for core, storage, workflow-engine, agent-runtime, providers, git-engine, doc-generator, ticket-system, shell, events; pnpm workspace with React/Vite desktop app and packages/ui, packages/constellation, packages/trpc-client.
- Architecture: modular monorepo with Rust crates, Tauri desktop app, CLI app, TypeScript packages, SQLite storage, workflow/agent modules

## Commands
- Lint: `cargo fmt --all -- --check; cargo clippy --all-targets --all-features -- -D warnings; pnpm run lint; pnpm run typecheck`
- Format: `cargo fmt --all`
- Test: `cargo test --workspace`
- Build: `cargo build --workspace; pnpm run build`
- Dev: `pnpm --filter @koklo/desktop dev`

## Required reading before substantial work
1. `AGENTS.md`
2. `.claude/CLAUDE.md`
3. `/home/devops/perso/projets/MyVault/Dev/koklo/agents/<own-role>/memory.md`
4. `/home/devops/perso/projets/MyVault/Dev/koklo/spec/engineering-standards.md`
5. the relevant sprint file in `/home/devops/perso/projets/MyVault/Dev/koklo/sprints/` when the task is sprint-based
6. `/home/devops/perso/projets/MyVault/Dev/koklo/workflows/runs/<run-id>/` artifacts when the task is workflow-orchestrated

## Agent roles
- Product Owner: `/home/devops/perso/projets/MyVault/Dev/koklo/agents/product-owner/`
- Developer: `/home/devops/perso/projets/MyVault/Dev/koklo/agents/developer/`
- Designer: `/home/devops/perso/projets/MyVault/Dev/koklo/agents/designer/`
- Analyst: `/home/devops/perso/projets/MyVault/Dev/koklo/agents/analyst/`
- QA Reviewer: `/home/devops/perso/projets/MyVault/Dev/koklo/agents/qa-reviewer/`
- Tech Lead: `/home/devops/perso/projets/MyVault/Dev/koklo/agents/tech-lead/`
- Specialized roles: `/home/devops/perso/projets/MyVault/Dev/koklo/agents/specialized/`

## Hard rules
- Never modify `/home/devops/perso/projets/MyVault/Dev/koklo/vision.md`
- Never check a sprint task box unless every acceptance criterion is verified
- Never add features absent from `/home/devops/perso/projets/MyVault/Dev/koklo/vision.md` without explicit user approval
- Never introduce a new framework without an ADR in `/home/devops/perso/projets/MyVault/Dev/koklo/decisions/`
- **Active refactoring is part of every task** — on every touched file, fix obvious duplication, dead code, and size violations (see `/home/devops/perso/projets/MyVault/Dev/koklo/spec/engineering-standards.md` §9). On existing/active projects this is in-scope of the current task, not a separate sprint. Untouched files stay untouched.
- After every `$sprint`, `$run-agent`, or `$run-workflow` call: tick verified sprint checkboxes, update `.project/state.json` (last_updated, last_workflow_run, last_task_completed, last_workflow_result; add to completed_sprints only if DoD is met), append a dated entry to relevant agent memory files, and update the backlog with any newly discovered items — no exceptions

## Memory protocol
After completing a task or workflow stage, append a dated entry to `/home/devops/perso/projets/MyVault/Dev/koklo/agents/<own-role>/memory.md`.

## MCP servers
Codex CLI reads project-local config from `.codex/config.toml`; Claude Code reads `.mcp.json`. Both ship the same defaults, installed by `bootstrap.sh`.

- `context7` — up-to-date docs. Optional `CONTEXT7_API_KEY` for higher rate limits.
- `cve-mcp` — `mukul975/cve-mcp-server`, vendored at `$HOME/.agent-setup/vendor/cve-mcp-server` with its own venv. Optional env keys: `NVD_API_KEY`, `GITHUB_TOKEN`, `ABUSEIPDB_KEY`, `GREYNOISE_API_KEY`, `SHODAN_KEY`.

Skip CVE install with `bash bootstrap.sh --no-mcp`; then remove the `cve-mcp` block from both config files.

## Project commands
```text
$init-project [optional-vision-file.md]
$sprint <sprint-number> [task-id]
$run-agent <agent> <task text>
$run-workflow <workflow> <task-id|task-text>
$upgrade-project
```

## Command semantics
- `$sprint` = sprint-scoped workflow orchestration using the workflow declared by each sprint task
- `$run-agent` = ad hoc single-agent execution outside sprint files
- `$run-workflow` = direct staged multi-agent orchestration with persisted handoff artifacts under `.project/workflows/`
- `$upgrade-project` = safe preview-first migration for older initialized projects
