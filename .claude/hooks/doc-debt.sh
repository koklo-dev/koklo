#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# doc-debt.sh — make documentation a continuous act, not an end-of-project one.
#
# Wired in .claude/settings.json as three hooks:
#   PostToolUse (Write|Edit|NotebookEdit) → `track`   record what the session touched
#   Stop                                  → `check`   refuse to end on undocumented work
#   SessionStart                          → `report`  surface documentation debt left behind
#
# The tier decision is NOT taken here: it is delegated to the framework's
# doc-impact-score.sh so the hook, the delivery loop and the agent all use the
# same deterministic rule (0 none / 1 technical / 2 full).
#
# Contract: never exit non-zero, never block on its own failure. Documentation
# enforcement must not be able to wedge a session.
# Opt out with SHIPYARD_DOC_HOOK=0, or "documentation": {"hook": false} in
# .project/state.json.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

MODE="${1:-check}"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
DEBT_DIR="$PROJECT_DIR/.project/.doc-debt"
FILES="$DEBT_DIR/files"
DOCS_TOUCHED="$DEBT_DIR/docs-touched"
CORE="${CLAUDE_HOME:-$HOME/.claude}/shipyard/bin"

[ "${SHIPYARD_DOC_HOOK:-1}" = '0' ] && exit 0
if [ -f "$PROJECT_DIR/.project/state.json" ] && command -v jq >/dev/null 2>&1; then
    [ "$(jq -r '.documentation.hook // true' "$PROJECT_DIR/.project/state.json" 2>/dev/null)" = 'false' ] && exit 0
fi

ensure_dir() {
    mkdir -p "$DEBT_DIR" 2>/dev/null || return 1
    # Self-ignoring: session bookkeeping must never reach a commit.
    [ -f "$DEBT_DIR/.gitignore" ] || printf '*\n' >"$DEBT_DIR/.gitignore" 2>/dev/null
}

case "$MODE" in
# ── track ────────────────────────────────────────────────────────────────────
track)
    input="$(cat 2>/dev/null || true)"
    command -v jq >/dev/null 2>&1 || exit 0
    path="$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.notebook_path // ""' 2>/dev/null)"
    [ -n "$path" ] || exit 0
    case "$path" in "$PROJECT_DIR"/*) path="${path#"$PROJECT_DIR"/}" ;; /*) exit 0 ;; esac
    ensure_dir || exit 0
    case "$path" in
        docs/*|doc/*|documentation/*|website/docs/*|*/CHANGELOG.md|CHANGELOG.md)
            printf '%s\n' "$path" >>"$DOCS_TOUCHED" 2>/dev/null ;;
        .project/*|.claude/*|.git/*) : ;;
        *)
            grep -qxF "$path" "$FILES" 2>/dev/null || printf '%s\n' "$path" >>"$FILES" 2>/dev/null ;;
    esac
    exit 0
    ;;

# ── check ────────────────────────────────────────────────────────────────────
check)
    input="$(cat 2>/dev/null || true)"
    [ -s "$FILES" ] || exit 0
    command -v jq >/dev/null 2>&1 || exit 0
    [ -x "$CORE/doc-impact-score.sh" ] || exit 0

    # Documentation already updated in this session → nothing to enforce.
    [ -s "$DOCS_TOUCHED" ] && { rm -f "$FILES" "$DOCS_TOUCHED" 2>/dev/null; exit 0; }

    session="$(printf '%s' "$input" | jq -r '.session_id // "unknown"' 2>/dev/null)"
    marker="$DEBT_DIR/notified-$session"
    [ -f "$marker" ] && exit 0

    score="$(SHIPYARD_PROJECT_ROOT="$PROJECT_DIR" "$CORE/doc-impact-score.sh" --files-from "$FILES" 2>/dev/null)" || exit 0
    tier="$(printf '%s' "$score" | jq -r '.tier // 0' 2>/dev/null)"
    [ "${tier:-0}" -gt 0 ] 2>/dev/null || { rm -f "$FILES" 2>/dev/null; exit 0; }

    label="$(printf '%s' "$score" | jq -r '.tier_label' 2>/dev/null)"
    targets="$(printf '%s' "$score" | jq -r '.impacted_docs | join(", ")' 2>/dev/null)"
    count="$(wc -l <"$FILES" | tr -d '[:space:]')"
    : >"$marker" 2>/dev/null

    reason="$(printf 'Documentation debt: %s file(s) changed in this session score a tier-%s (%s) documentation pass, and no documentation file was touched.\n\nDo one of these before finishing:\n  1. run the /document skill (scope: ticket) so it updates exactly %s — plus the functional guide and its screenshots if the tier is full;\n  2. or state explicitly, in one line, why this change needs no documentation (pure refactor, no observable behaviour change).\n\nThis is asked once per session — documentation is written with the code, not after it.' \
        "$count" "$tier" "$label" "${targets:-the impacted documents}")"
    jq -n --arg r "$reason" '{decision:"block", reason:$r,
        hookSpecificOutput:{hookEventName:"Stop", additionalContext:$r}}' 2>/dev/null
    exit 0
    ;;

# ── report ───────────────────────────────────────────────────────────────────
report)
    cat >/dev/null 2>&1 || true
    [ -s "$FILES" ] || exit 0
    command -v jq >/dev/null 2>&1 || exit 0
    count="$(wc -l <"$FILES" | tr -d '[:space:]')"
    ctx="$(printf 'Documentation debt carried over from a previous session: %s changed file(s) recorded in .project/.doc-debt/files have no matching documentation update. Run the /document skill (scope: ticket) when you touch this area again.' "$count")"
    jq -n --arg c "$ctx" '{hookSpecificOutput:{hookEventName:"SessionStart", additionalContext:$c}}' 2>/dev/null
    exit 0
    ;;

# ── clear ────────────────────────────────────────────────────────────────────
clear)
    rm -f "$FILES" "$DOCS_TOUCHED" 2>/dev/null
    rm -f "$DEBT_DIR"/notified-* 2>/dev/null
    exit 0
    ;;

*) exit 0 ;;
esac
