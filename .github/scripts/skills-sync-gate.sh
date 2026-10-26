#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# skills-sync-gate.sh — fail when a project skill override is not in sync with
# the copy the agent runtimes actually load.
#
# `shipyard/skills/<name>.md` is the versioned source of truth, but no runtime
# reads it. Claude Code loads `.claude/skills/<name>/SKILL.md`, Codex
# `.codex/skills/<name>/SKILL.md`. Edit the source, forget to republish, and
# every session keeps following the stale procedure — silently, because nothing
# reports a difference. That is exactly how a skill drifts away from the CI
# commands it is supposed to mirror.
#
# Deliberately dependency-free (bash + awk): it runs on a bare CI runner with no
# shipyard installation.
#
# Usage:  bash .github/scripts/skills-sync-gate.sh [project-dir]
# Exit 0 = in sync (or no overrides). Exit 1 = drift. Exit 2 = usage error.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

ROOT="${1:-.}"
[ -d "$ROOT" ] || { echo "no such directory: $ROOT" >&2; exit 2; }
ROOT="$(cd "$ROOT" && pwd)"

SRC_DIR="$ROOT/shipyard/skills"
MANIFEST="$ROOT/.claude/skills/.shipyard-managed"

if [ ! -d "$SRC_DIR" ]; then
    echo "skills-sync-gate: no shipyard/skills/ — nothing to check"
    exit 0
fi

# The runtime keys on the frontmatter `name`, not the filename, so that is what
# decides the directory a skill must live in.
skill_name_of() {
    local file="$1" name
    name="$(awk '
        NR == 1 && $0 != "---" { exit }
        NR > 1 && $0 == "---"  { exit }
        NR > 1 && $0 ~ /^name:[[:space:]]*/ {
            sub(/^name:[[:space:]]*/, ""); gsub(/^["'"'"']|["'"'"']$/, ""); print; exit
        }' "$file" 2>/dev/null)"
    [ -n "$name" ] || name="$(basename "$file" .md)"
    printf '%s' "$name"
}

runtimes=(".claude/skills")
[ -d "$ROOT/.codex" ] && runtimes+=(".codex/skills")

drift=0
names=()

for src in "$SRC_DIR"/*.md; do
    [ -f "$src" ] || continue
    name="$(skill_name_of "$src")"
    names+=("$name")
    for rt in "${runtimes[@]}"; do
        target="$ROOT/$rt/$name/SKILL.md"
        if [ ! -f "$target" ]; then
            echo "✗ never published: $rt/$name/SKILL.md (source: shipyard/skills/$(basename "$src"))"
            drift=1
        elif ! cmp -s "$src" "$target"; then
            echo "✗ stale: $rt/$name/SKILL.md differs from shipyard/skills/$(basename "$src")"
            drift=1
        fi
    done
done

# A skill deleted upstream but still published keeps being loaded, and keeps
# advertising commands the project no longer runs. Only manifest-listed names are
# checked, so a hand-written skill is never reported as an orphan.
if [ -f "$MANIFEST" ]; then
    while IFS= read -r known; do
        [ -n "$known" ] || continue
        for name in ${names[@]+"${names[@]}"}; do
            [ "$name" = "$known" ] && { known=""; break; }
        done
        [ -n "$known" ] || continue
        for rt in "${runtimes[@]}"; do
            [ -e "$ROOT/$rt/$known/SKILL.md" ] || continue
            echo "✗ orphan: $rt/$known/SKILL.md has no source in shipyard/skills/"
            drift=1
        done
    done <"$MANIFEST"
fi

if [ "$drift" -ne 0 ]; then
    cat >&2 <<'EOF'

The published copies are what the agent runtimes load. Republish them:

  "${CLAUDE_HOME:-$HOME/.claude}/shipyard/bin/install-project-skills.sh" . apply

then commit the result. Never hand-edit a file under .claude/skills/ or
.codex/skills/ — it is generated from shipyard/skills/ and will be overwritten.
EOF
    exit 1
fi

echo "✅ ${#names[@]} skill(s) in sync across ${#runtimes[@]} runtime(s)."
