# BMAD Integration (Koklo Community)

This repository is configured with BMAD Method v6 (module: `bmm`).

## Installed Components

- `_bmad/` core + bmm module
- `.claude/commands/` generated BMAD commands
- `.agents/skills/` generated BMAD skills for Codex-compatible tooling
- Custom agent context in `_bmad/_config/agents/*.customize.yaml`

## Recommended Command Entry Points

- PM: `/bmad-agent-bmm-pm`
- Analyst: `/bmad-agent-bmm-analyst`
- Architect: `/bmad-agent-bmm-architect`
- Dev: `/bmad-agent-bmm-dev`
- QA: `/bmad-agent-bmm-qa`
- SM: `/bmad-agent-bmm-sm`
- Tech Writer: `/bmad-agent-bmm-tech-writer`
- Help: `/bmad-help`

## Quality Policy

All implementation stories should satisfy:

1. `bash scripts/check-boundary.sh`
2. `bash scripts/bmad-quality-check.sh`
3. Updated tests for behavior changes
4. No open-core coupling to `koklo-ee`

## OpenClaw Bridge

Use `_bmad/integration/openclaw-agents-patch.yml` to patch OpenClaw agent mapping.
