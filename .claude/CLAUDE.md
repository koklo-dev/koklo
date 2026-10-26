<!-- generated-by: /init-project -->
<!-- vars: PROJECT_NAME, STACK_DETAILS, ARCHITECTURE_STYLE, LINT_CMD, FORMAT_CMD, TEST_CMD, BUILD_CMD, DEV_CMD, VAULT_PROJECT_PATH, SPEC_PATH, AGENTS_DIR, WORKFLOWS_DEF_DIR, WORKFLOWS_RUNS_DIR, SPRINTS_DIR, VISION_PATH -->
# CLAUDE.md — koklo

> Auto-loaded by Claude Code every session. Keep this file short. Long content goes in spec/, agents/<role>/, or sprints/.

## Project
- Name: koklo
- Vision: `/home/devops/perso/projets/MyVault/koklo-v2/vision.md` (source of truth, never auto-edit)
- State: `.project/state.json`
- Engineering spec: `/home/devops/perso/projets/MyVault/koklo-v2/spec/engineering-standards.md` (read before coding)
- Design: `DESIGN.md` (identité, tokens, typographie, icônes, formes, accessibilité — **lire avant tout travail sur `apps/web` ou `packages/ui`**) et `PRODUCT.md` (publics, ton, anti-références). Les maquettes citées dans `DESIGN.md` sont un artefact privé : pour un agent, seul le texte de `DESIGN.md` fait foi
- Effective rules: run `engineering-rules explain --agent <role> --path <scope>`
- Workflow runs: `/home/devops/perso/projets/MyVault/koklo-v2/workflows/runs/`

## Stack (detected)
- TypeScript strict, Node.js 24 LTS, pnpm workspaces + Turborepo ; Next.js, NestJS + oRPC, Prisma 7 + PostgreSQL 17, pg-boss, Better Auth, Biome, Vitest, Playwright (source: vision §16.1)
- Architecture: monorepo pnpm + Turborepo, ports et adaptateurs (packages/domain pur) (source: vision §16.2, §17.1)

## Commands
- Lint: `pnpm lint`
- Format: `TO CLARIFY`
- Test: `pnpm test`
- Build: `pnpm build`
- Dev: `pnpm dev`

Also available as `make` targets (`make help`): `make lint|test|build|dev` read these
commands from `.project/state.json`; `make session` opens a Claude+Happy session in tmux
(detach: `Ctrl-b` then `d`); `make loop-status|logs|stop|restart` drive the delivery loop
whatever its mounting (systemd system/user, or tmux); `make status` summarises branch,
sprint and loop. Framework-owned targets live in
`.project/make/shipyard.mk` — never edit it, add project targets to the root `Makefile`.

## Project skills (invoke them by name)
`push-to-github`, `create-pr`, `run-tests`, `lint-and-format`, `dependency-audit`,
`dependency-selection`, `engineering-rules` — versioned in `shipyard/skills/<name>.md`,
published into `.claude/skills/` and `.codex/skills/` by
`~/.claude/shipyard/bin/install-project-skills.sh`. That published copy is what the
runtime loads, and it overrides the global skill of the same name. After editing a
`shipyard/skills/<name>.md`, **re-publish it** — the `skills in sync` CI job fails
otherwise. Never hand-edit a file under `.claude/skills/` or `.codex/skills/`: it is
generated. They carry this project's exact CI commands — the delivery loop replays
those same gates before every push.

## Agents — one per role, with own memory
- Product Owner -> `/home/devops/perso/projets/MyVault/koklo-v2/agents/product-owner/agent.md` + `memory.md`
- Developer -> `/home/devops/perso/projets/MyVault/koklo-v2/agents/developer/agent.md` + `memory.md`
- Designer -> `/home/devops/perso/projets/MyVault/koklo-v2/agents/designer/agent.md` + `memory.md`
- Analyst -> `/home/devops/perso/projets/MyVault/koklo-v2/agents/analyst/agent.md` + `memory.md`
- QA Reviewer -> `/home/devops/perso/projets/MyVault/koklo-v2/agents/qa-reviewer/agent.md` + `memory.md`
- Tech Lead -> `/home/devops/perso/projets/MyVault/koklo-v2/agents/tech-lead/agent.md` + `memory.md`
- Documentation Writer -> `/home/devops/perso/projets/MyVault/koklo-v2/agents/doc-writer/agent.md` + `memory.md`
- Specialised -> `/home/devops/perso/projets/MyVault/koklo-v2/agents/specialized/`

## Documentation (continuous, two audiences)
Documentation is written **with** the code, never after it.
- **Technical** — any developer or AI agent can pick the project up from it:
  `<docs-root>/onboarding.md`, `architecture.md` (C4 levels 1–3), `domain-model.md`,
  `api-contract.md`, `quality-and-operations.md`, `decisions/` (ADRs).
- **Functional** — the client learns to use the product: `<docs-root>/functional/`,
  one page per task, illustrated with generated screenshots.
- **Mermaid is the diagram standard**, inside the document it explains. No binary images.
- The suite is versioned: `<docs-root>/DOC-VERSION` + per-document frontmatter
  (`doc_version`, `last_reviewed`, `covers_commit`), snapshot at each release.
- `<docs-root>` is resolved by `detect-docs-target.sh`: an existing Docusaurus/MkDocs
  site is respected, otherwise `docs/` is used as a markdown vault.
- **Trigger**: `doc-impact-score.sh` scores every change — tier 0 nothing, tier 1
  technical, tier 2 technical + functional + screenshots. The Stop hook
  (`.claude/hooks/doc-debt.sh`) asks once per session when the score says a pass is
  owed and no documentation was touched. Run `/document` to perform it.

## Path resolution
Read `.project/state.json` for `vault_project_path`. If set, all agent/workflow/sprint paths are under the vault. Skills resolve paths automatically.

## Memory protocol
Before substantial work, every agent must read:
1. `.claude/CLAUDE.md`
2. `/home/devops/perso/projets/MyVault/koklo-v2/agents/<own-role>/memory.md`
3. `/home/devops/perso/projets/MyVault/koklo-v2/spec/engineering-standards.md`
4. the relevant sprint file: `/home/devops/perso/projets/MyVault/koklo-v2/sprints/sprint-NNN.md`
5. `/home/devops/perso/projets/MyVault/koklo-v2/workflows/runs/<run-id>/` artifacts when workflow-orchestrated

Before acting, resolve only the applicable engineering rules for the current
role and package. Before a PASS, run `engineering-rules validate` and cite every
required evidence rule id in the stage artifact. `UNVERIFIED` cannot become PASS.

After completing a task or workflow stage, append a dated entry to that agent's `memory.md`.

## Hard rules
- Never modify `/home/devops/perso/projets/MyVault/koklo-v2/vision.md`
- Never check a sprint task box unless every acceptance criterion is verified
- Never add features absent from the vision without explicit user approval
- Never introduce a new framework without an ADR in the decisions folder
- **Active refactoring is part of every task** — on every touched file, fix obvious duplication, dead code, and size violations (see `/home/devops/perso/projets/MyVault/koklo-v2/spec/engineering-standards.md` §9). On existing/active projects this is in-scope of the current task, not a separate sprint. Untouched files stay untouched.

## MCP servers
Config shipped for Claude Code, versioned at repo root:
- `.mcp.json` — Claude Code
- `.codex/config.toml` — Codex CLI

**Active by default:**
- `context7` — up-to-date library/framework documentation. Use before adopting a new API or upgrading a dependency. Optional `CONTEXT7_API_KEY` env var for higher rate limits (https://context7.com/dashboard).
- `cve-mcp` (`mukul975/cve-mcp-server`) — 27 security tools (OSV.dev, GitHub Security Advisories, CISA KEV, MITRE ATT&CK). Installed by `bootstrap.sh` at `$HOME/.shipyard/vendor/cve-mcp-server` with its own venv. Optional API keys via env: `NVD_API_KEY`, `GITHUB_TOKEN`, `ABUSEIPDB_KEY`, `GREYNOISE_API_KEY`, `SHODAN_KEY` (works without).

To skip the local CVE MCP install: `bash bootstrap.sh --no-mcp`. If skipped, remove the `cve-mcp` entries from `.mcp.json` and `.codex/config.toml`.

## Project commands
```text
/init-project [optional-vision-file.md] [vault_path=/abs/path]
/migrate [vault_path=/abs/path]
/sprint <sprint-number> [task-id]
/run-agent <agent> <task text>
/run-workflow <workflow> <task-id|task-text>
/document [ticket|sprint|period|screenshots|setup]
/upgrade-project
```

## Command semantics
- `/init-project` = initialize project; use `vault_path=` to enable Obsidian vault mode
- `/migrate` = migrate existing .project/ and shipyard/ to an Obsidian vault
- `/sprint` = sprint-scoped workflow orchestration
- `/run-agent` = ad hoc single-agent execution outside sprint files
- `/run-workflow` = direct staged multi-agent orchestration
- `/document` = documentation pass (technical + functional), scope-scored and versioned
- `/upgrade-project` = safe preview-first migration for older initialized projects
