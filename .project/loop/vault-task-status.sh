#!/usr/bin/env bash
# Write a task's delivery state back into its vault sprint file.
#
# materialize-sprint-issues.sh projects the vault into GitHub; nothing travelled
# back. Merged issues left their sprint checkbox unticked, so the vault — the
# operator-facing board — could not be read as progress. This closes the loop.
#
#   vault-task-status.sh <issue> <done|blocked|in-review|in-progress|todo> [detail]
#
# Idempotent: the task line and its single status line are rewritten in place,
# so replaying the same state twice produces the same file.
set -euo pipefail

ISSUE="${1:?usage: vault-task-status.sh <issue> <state> [detail]}"
STATE_NAME="${2:?state required}"
DETAIL="${3:-}"

[ "${SHIPYARD_VAULT_WRITEBACK:-1}" != 0 ] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
STATE="$REPO_ROOT/.project/state.json"
[ -r "$STATE" ] || exit 0

VAULT="$(jq -r '.vault_project_path // empty' "$STATE" 2>/dev/null || true)"
if [ -n "$VAULT" ]; then SPRINTS="$VAULT/sprints"; else SPRINTS="$REPO_ROOT/.project/sprints"; fi
[ -d "$SPRINTS" ] || exit 0
[ -w "$SPRINTS" ] || { echo "vault-task-status: $SPRINTS is not writable" >&2; exit 0; }

# ── Resolve the vault task id ────────────────────────────────────────────────
# With the vault as the TRACKER there is no issue to resolve: the id handed in
# is already the vault task id, and asking GitHub about it would fail and skip
# the write-back entirely. With GitHub as the tracker the id is an issue number,
# and the materializer's `<!-- shipyard-task: ID -->` marker is authoritative —
# the `[ID] title` convention is the fallback for issues created by hand.
if [ "${SHIPYARD_TICKETS:-github}" = vault ]; then
    TASK_ID="$ISSUE"
    ISSUE_REF="$TASK_ID"
else
    issue_json="$(gh issue view "$ISSUE" --json title,body,url 2>/dev/null || true)"
    [ -n "$issue_json" ] || exit 0
    TASK_ID="$(jq -r '.body // ""' <<<"$issue_json" \
        | sed -nE 's/.*<!--[[:space:]]*shipyard-task:[[:space:]]*([A-Za-z0-9_.-]+)[[:space:]]*-->.*/\1/p' | head -1)"
    [ -n "$TASK_ID" ] || TASK_ID="$(jq -r '.title // ""' <<<"$issue_json" \
        | sed -nE 's/^\[([^]]+)\].*/\1/p' | head -1)"
    [ -n "$TASK_ID" ] || { echo "vault-task-status: no task id for issue #$ISSUE" >&2; exit 0; }
    ISSUE_URL="$(jq -r '.url // ""' <<<"$issue_json")"
    if [ -n "$ISSUE_URL" ]; then ISSUE_REF="[#$ISSUE]($ISSUE_URL)"; else ISSUE_REF="#$ISSUE"; fi
fi

FILE="$(grep -l -- "\*\*\[$TASK_ID\]\*\*" "$SPRINTS"/sprint-*.md 2>/dev/null | head -1 || true)"
[ -n "$FILE" ] || { echo "vault-task-status: $TASK_ID absent from $SPRINTS" >&2; exit 0; }

# ── Render the status line ───────────────────────────────────────────────────
TODAY="${SHIPYARD_VAULT_DATE:-$(date +%F)}"

case "$STATE_NAME" in
    done)        BADGE="✅ **livrée**" ;;
    blocked)     BADGE="🔴 **bloquée**" ;;
    in-review)   BADGE="🔵 **en review**" ;;
    in-progress) BADGE="🟡 **en cours**" ;;
    todo)        BADGE="" ;;
    *) echo "vault-task-status: unknown state '$STATE_NAME'" >&2; exit 2 ;;
esac

# A caller that cannot name the detail must not erase one already recorded. The
# reconciliation pass finds no linking PR for an issue a human closed by hand
# (#60, #61), and replaying "done" with an empty detail dropped the "PR #70" the
# merge step had written. Carry the old detail over only when the badge is
# unchanged: a "needs-human" detail has no business on a ✅ livrée line.
PREV="$(grep -F -- "<!-- shipyard-status:$TASK_ID -->" "$FILE" 2>/dev/null | head -1 || true)"
if [ -z "$DETAIL" ] && [ -n "$BADGE" ]; then
    case "$PREV" in
        *"$BADGE"*) DETAIL="$(awk -F ' · ' 'NF >= 4 { d = $3; for (i = 4; i < NF; i++) d = d " · " $i; print d }' <<<"$PREV")" ;;
    esac
fi

# The stamp dates the *transition*, not the last time anyone looked. Reusing
# today's date on an unchanged line made the reconciliation pass — which now
# replays every touched issue on every run — rewrite and re-commit the sprint
# file once a day for nothing. Same badge, same detail → keep the original date,
# which is what makes a replay a true no-op.
STAMP="$TODAY"
if [ -n "$BADGE" ] && [ -n "$PREV" ]; then
    PREV_DATE="$(sed -nE 's/.* · ([0-9]{4}-[0-9]{2}-[0-9]{2}) <!--.*/\1/p' <<<"$PREV")"
    if [ -n "$PREV_DATE" ]; then
        UNCHANGED="  - Statut : $BADGE · $ISSUE_REF"
        [ -n "$DETAIL" ] && UNCHANGED="$UNCHANGED · $DETAIL"
        UNCHANGED="$UNCHANGED · $PREV_DATE <!-- shipyard-status:$TASK_ID -->"
        [ "$UNCHANGED" = "$PREV" ] && STAMP="$PREV_DATE"
    fi
fi

STATUS_LINE=""
if [ -n "$BADGE" ]; then
    STATUS_LINE="  - Statut : $BADGE · $ISSUE_REF"
    [ -n "$DETAIL" ] && STATUS_LINE="$STATUS_LINE · $DETAIL"
    STATUS_LINE="$STATUS_LINE · $STAMP <!-- shipyard-status:$TASK_ID -->"
fi

# ── Rewrite the task line and its status line ────────────────────────────────
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

#  `[^*]*` tolerates a priority marker between the checkbox and the bold id
#  ("- [ ] 🔴 **[INF-008]** …"), exactly as the materializer's own pattern does.
#  Without it the task line never matched: a prioritised task could be projected
#  into an issue, developed and merged, and its sprint line still showed nothing
#  — no badge, no tick — because every write-back silently matched no line.
awk -v task="$TASK_ID" -v want="$STATE_NAME" -v status="$STATUS_LINE" '
  BEGIN { marker = "<!-- shipyard-status:" task " -->" }
  index($0, marker) > 0 { next }                       # drop the previous status line
  {
    if ($0 ~ ("^- \\[[ xX]\\] [^*]*\\*\\*\\[" task "\\]\\*\\*")) {
      if (want == "done") sub(/^- \[[^]]*\]/, "- [x]")
      else                sub(/^- \[[^]]*\]/, "- [ ]")
      print
      if (status != "") print status
      next
    }
    print
  }
' "$FILE" >"$tmp"

# ── Regenerate the progress banner ───────────────────────────────────────────
# Counts are derived from the file itself, so a hand-edited checkbox is honoured
# exactly like one the loop ticked. `[^*]*` for the same reason as above: a
# prioritised task is a task, and leaving it out of the denominator made the
# banner announce progress over a backlog smaller than the real one.
total="$(grep -cE '^- \[[ xX]\] [^*]*\*\*\[' "$tmp" || true)";        total="${total:-0}"
done_ct="$(grep -cE '^- \[[xX]\] [^*]*\*\*\[' "$tmp" || true)";       done_ct="${done_ct:-0}"
blocked_ct="$(grep -cE '^[[:space:]]+- Statut : 🔴' "$tmp" || true)";      blocked_ct="${blocked_ct:-0}"
wip_ct="$(grep -cE '^[[:space:]]+- Statut : (🟡|🔵)' "$tmp" || true)";     wip_ct="${wip_ct:-0}"
todo_ct=$(( total - done_ct - blocked_ct - wip_ct ))
[ "$todo_ct" -lt 0 ] && todo_ct=0

if [ "$total" -gt 0 ]; then
    filled=$(( done_ct * 16 / total )); empty=$(( 16 - filled ))
    bar=""; i=0
    while [ "$i" -lt "$filled" ]; do bar="$bar█"; i=$((i + 1)); done
    i=0
    while [ "$i" -lt "$empty" ]; do bar="$bar░"; i=$((i + 1)); done

    # Same reasoning as the status stamp: the banner dates the last *change* in
    # progress, so identical counts keep their original date and a replay stays
    # a no-op.
    headline="$(printf '> [!info] Avancement — %s/%s livrée(s)' "$done_ct" "$total")"
    counts="$(printf '> `%s`  ·  🟡 %s en cours  ·  🔴 %s bloquée(s)  ·  ⚪ %s à faire' \
        "$bar" "$wip_ct" "$blocked_ct" "$todo_ct")"
    banner_date="$TODAY"
    if grep -qxF -- "$headline" "$FILE" && grep -qxF -- "$counts" "$FILE"; then
        prev_banner_date="$(sed -nE 's/^> _Mis à jour par la boucle de livraison le ([0-9]{4}-[0-9]{2}-[0-9]{2})\._$/\1/p' "$FILE" | head -1)"
        [ -n "$prev_banner_date" ] && banner_date="$prev_banner_date"
    fi

    banner="$(mktemp)"
    {
        echo '<!-- shipyard-progress:start -->'
        printf '%s\n' "$headline"
        printf '%s\n' "$counts"
        printf '> _Mis à jour par la boucle de livraison le %s._\n' "$banner_date"
        echo '<!-- shipyard-progress:end -->'
    } >"$banner"

    merged="$(mktemp)"
    if grep -q '<!-- shipyard-progress:start -->' "$tmp"; then
        awk -v banner="$banner" '
          $0 ~ /<!-- shipyard-progress:start -->/ { skip = 1; while ((getline l < banner) > 0) print l; close(banner); next }
          $0 ~ /<!-- shipyard-progress:end -->/   { skip = 0; next }
          !skip { print }
        ' "$tmp" >"$merged"
    else
        # First run: park the banner just above the task list.
        awk -v banner="$banner" '
          !placed && /^## / && /Tasks/ { while ((getline l < banner) > 0) print l; close(banner); print ""; placed = 1 }
          { print }
          END { if (!placed) { while ((getline l < banner) > 0) print l } }
        ' "$tmp" >"$merged"
    fi
    mv "$merged" "$tmp"
    rm -f "$banner"
fi

cmp -s "$tmp" "$FILE" && { echo "vault-task-status: $TASK_ID already $STATE_NAME"; exit 0; }
cat "$tmp" >"$FILE"
echo "vault-task-status: $TASK_ID → $STATE_NAME in $(basename "$FILE")"

# ── Publish the vault ────────────────────────────────────────────────────────
# A vault the operator reads from their phone is only useful once pushed.
[ "${SHIPYARD_VAULT_PUSH:-1}" != 0 ] || exit 0

if [ -n "${SHIPYARD_VAULT_SYNC_CMD:-}" ]; then
    eval "$SHIPYARD_VAULT_SYNC_CMD" >/dev/null 2>&1 || true
    exit 0
fi
if [ -x "$REPO_ROOT/.claude/hooks/vault-sync.sh" ]; then
    CLAUDE_PROJECT_DIR="$REPO_ROOT" "$REPO_ROOT/.claude/hooks/vault-sync.sh" flush >/dev/null 2>&1 || true
    exit 0
fi

VAULT_ROOT="$(git -C "$SPRINTS" rev-parse --show-toplevel 2>/dev/null || true)"
[ -n "$VAULT_ROOT" ] || exit 0
[ "$(git -C "$VAULT_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null)" = main ] || exit 0

# A git killed mid-write (OOM, a session cut off) leaves an empty index.lock
# that makes every `git add` fail silently thereafter (this whole block is
# best-effort, `|| exit 0` throughout) — the writeback just stops with no
# signal. Purge it, but only once it is stale (default 2 min,
# SHIPYARD_VAULT_LOCK_MAX_AGE) AND no process still holds an fd on it, so a
# git genuinely in flight is never touched.
if [ "${SHIPYARD_VAULT_LOCK_PURGE:-1}" != 0 ]; then
    lockfile="$VAULT_ROOT/.git/index.lock"
    if [ -e "$lockfile" ]; then
        max_age="${SHIPYARD_VAULT_LOCK_MAX_AGE:-120}"
        mtime="$(stat -c %Y "$lockfile" 2>/dev/null || stat -f %m "$lockfile" 2>/dev/null || echo 0)"
        age=$(( $(date +%s) - mtime ))
        if [ "$age" -gt "$max_age" ]; then
            held=0
            if command -v fuser >/dev/null 2>&1; then
                fuser "$lockfile" >/dev/null 2>&1 && held=1
            else
                for fd in /proc/[0-9]*/fd/*; do
                    [ -e "$fd" ] || continue
                    [ "$(readlink "$fd" 2>/dev/null)" = "$lockfile" ] && { held=1; break; }
                done
            fi
            [ "$held" = 0 ] && rm -f "$lockfile"
        fi
    fi
fi

git -C "$VAULT_ROOT" add -- "$FILE" >/dev/null 2>&1 || exit 0
git -C "$VAULT_ROOT" diff --cached --quiet -- "$FILE" && exit 0
if [ "${SHIPYARD_TICKETS:-github}" = vault ]; then
    COMMIT_MSG="docs(sprint): $TASK_ID → $STATE_NAME"
else
    COMMIT_MSG="docs(sprint): $TASK_ID → $STATE_NAME (issue #$ISSUE)"
fi
git -C "$VAULT_ROOT" commit -q -m "$COMMIT_MSG" >/dev/null 2>&1 || exit 0
git -C "$VAULT_ROOT" push -q origin main >/dev/null 2>&1 && exit 0
git -C "$VAULT_ROOT" pull --rebase --autostash -q origin main >/dev/null 2>&1 || exit 0
git -C "$VAULT_ROOT" push -q origin main >/dev/null 2>&1 || true
