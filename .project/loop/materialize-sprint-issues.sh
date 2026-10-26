#!/usr/bin/env bash
# Project the unchecked tasks of one vault sprint into GitHub Issues/Project.
# The vault remains authoritative; exact titles make repeated runs idempotent.
set -euo pipefail

PROJECT_NUMBER="${1:?usage: materialize-sprint-issues.sh <project> <owner> <sprint-file> <iteration-title>}"
OWNER="${2:?board owner required}"
SPRINT_FILE="${3:?sprint file required}"
ITERATION_TITLE="${4:?iteration title required}"
[ -f "$SPRINT_FILE" ] || { echo "sprint file not found: $SPRINT_FILE" >&2; exit 2; }

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
UPSERT="${SHIPYARD_UPSERT_ISSUE:-$SCRIPT_DIR/upsert-project-issue.sh}"
if [ ! -x "$UPSERT" ]; then
  FRAMEWORK="${CLAUDE_HOME:-$HOME/.claude}/shipyard"
  UPSERT="$FRAMEWORK/bin/upsert-project-issue.sh"
fi
[ -x "$UPSERT" ] || { echo "upsert-project-issue.sh not found" >&2; exit 2; }

DELAY="${SHIPYARD_ISSUE_CREATE_DELAY:-1.5}"
DEFAULT_LABELS="${SHIPYARD_SPRINT_ISSUE_LABELS:-status:todo safe}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# Only first-level, unchecked sprint tasks are projected. Acceptance-criterion
# checkboxes are indented and therefore deliberately excluded. `[^*]*` tolerates
# an optional priority marker between the checkbox and the bold ticket ID (e.g.
# "- [ ] 🔴 **[INF-008]** ...") — without it, those lines silently never match
# and the task never becomes an issue (found 2026-08-11: 5 critical tickets
# inserted with a 🔴 prefix sat un-materialized in sprint-004.md indefinitely).
sed -nE 's/^- \[ \] [^*]*\*\*\[([^]]+)\]\*\*[[:space:]]*(.+)$/\1\	\2/p' \
  "$SPRINT_FILE" >"$work/tasks.tsv"

created=0
while IFS=$'\t' read -r task_id task_title; do
  [ -n "$task_id" ] || continue
  body="$work/$task_id.md"
  awk -v wanted="$task_id" '
    BEGIN { capture=0 }
    /^- \[[ xX]\] [^*]*\*\*\[[^]]+\]\*\*/ {
      if (capture) exit
      if (index($0, "[" wanted "]")) capture=1
    }
    capture {
      if ($0 ~ /^## / && seen) exit
      print
      seen=1
    }
  ' "$SPRINT_FILE" >"$body"
  {
    printf '\n---\n'
    printf 'Vault source: `%s`\n' "$SPRINT_FILE"
    printf '<!-- shipyard-task: %s -->\n' "$task_id"
  } >>"$body"

  # shellcheck disable=SC2086 # labels are intentionally a whitespace list.
  SHIPYARD_TARGET_SPRINT="$ITERATION_TITLE" \
  SHIPYARD_ISSUE_CREATE_DELAY="$DELAY" \
    "$UPSERT" "$PROJECT_NUMBER" "$OWNER" "[$task_id] $task_title" "$body" $DEFAULT_LABELS >/dev/null
  created=$((created + 1))
done <"$work/tasks.tsv"

printf 'materialized %s unchecked task(s) from %s into %s\n' \
  "$created" "$SPRINT_FILE" "$ITERATION_TITLE"
