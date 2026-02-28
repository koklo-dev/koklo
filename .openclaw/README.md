# OpenClaw Integration (Koklo Community)

This repo uses OpenClaw as orchestrator and BMAD v6 as execution layer.

## Important Compatibility Notes

- This setup is BMAD-v6 compatible (`/bmad-agent-bmm-*` command family).
- It does not replace existing `.github/workflows/ci.yml`.
- The reference workflow file is `.openclaw/workflows/github-actions-ci.yml`; copy/merge only if needed.

## Quick Start

1. `cp .openclaw/.env.example .openclaw/.env`
2. Fill credentials and channel IDs.
3. Run `.openclaw/scripts/setup.sh`
4. Start orchestration with your local OpenClaw install, for example:
   - `openclaw run feature_development --input feature_title="B3 Context Engine" --input feature_description="..."`

## BMAD Mapping

OpenClaw agent ids map to BMAD commands in `.openclaw/openclaw.config.yml`.
