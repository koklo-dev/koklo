# Upgrade migration — v1.11.0 (TDD rollout)

Date: 2026-07-13

## Actions taken

| Action | Path | Backup | Reason |
|---|---|---|---|
| create | `<vault>/agents/test-writer/agent.md` | (none, new file) | New role added in framework v1.11.0 |
| create | `<vault>/agents/test-writer/memory.md` | (none, new file) | New role added in framework v1.11.0 |
| replace | `<vault>/spec/engineering-standards.md` | `vault/spec/engineering-standards.md` | Missing §11 Test-Driven Development section |
| replace | `<vault>/agents/developer/agent.md` | `vault/agents/developer/agent.md` | Missing test-writer/§11 TDD green-phase reference |
| replace | `<vault>/agents/qa-reviewer/agent.md` | `vault/agents/qa-reviewer/agent.md` | Missing TDD adherence backstop (§11) |
| replace | `<vault>/workflows/definitions/analyze-design-dev-review.md` | `vault/workflows/definitions/analyze-design-dev-review.md` | Stage 3 was monolithic; split into 3a-Red/3b-Green/3c-Refactor |
| replace | `agent-setup/skills/run-tests.md` | `repo/agent-setup/skills/run-tests.md` | Missing `expect-fail` mode for TDD red-phase proof |

`<vault>` = `/home/devops/perso/projets/MyVault/Dev/koklo`

## Left untouched (user confirmed)
- `AGENTS.md` (repo root) — hand-customized with vault-absolute paths; current framework's `AGENTS.md.tpl` doesn't support vault-path substitution, so replacing it would regress a deliberate improvement.

## Skipped (already up to date / user-authored)
- `.claude/CLAUDE.md`, `.mcp.json`, `.codex/config.toml`, `.project/state.json`
- `agents/designer/agent.md`, `agents/product-owner/`, `agents/analyst/`, `agents/tech-lead/`
- `workflows/definitions/bug-triage.md`, `release.md`, `spike-research.md`
- `agent-setup/skills/create-pr.md`, `lint-and-format.md`, `push-to-github.md`, `dependency-audit.md`
- `PRODUCT.md`, `DESIGN.md`
- Vault `_README.md`, `_MOC_*.md`, `sprints/sprint-001.md`, `sprints/backlog.md`
