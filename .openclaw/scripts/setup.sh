#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if [ ! -d _bmad ] || [ ! -d .claude/commands ]; then
  echo "BMAD artifacts not found."
  echo "Expected _bmad/ and .claude/commands/ in this repo."
  echo "Merge/apply BMAD initialization first (branch: feat/bmad-initialization)."
  exit 1
fi

if [ ! -f .openclaw/.env ]; then
  cp .openclaw/.env.example .openclaw/.env
  echo "Created .openclaw/.env from template"
fi

echo "OpenClaw setup ready."
