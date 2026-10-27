#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# agent-loop.sh — shipyard autonomous delivery loop (minimal, P1).
#
# Loop engineering, not "let the model decide": THIS script owns control flow.
# Each run is TWO sequential phases over a bounded queue each, with a FRESH
# agent session per step, and the merge gate is HARD signals first, agent
# judgement second (docs/PLAN.md §9). The two phases are decoupled so a slow
# PR's CI/review never stalls the next issue's development:
#
#   Phase 1 (dev, process_issue_dev):
#     pick todo issue → worktree+branch → DEV (Sonnet) → commit/push/PR
#     → status:in-review, and straight on to the next todo issue. Never waits
#     on CI or a review verdict.
#   Phase 2 (review, process_issue_review), same run, right after Phase 1:
#     scan status:in-review issues → fresh REVIEW (Opus by default) waits for
#     green CI → hard-gate + approve → rebase-merge (squash only if the branch
#     carries a merge commit) → issue done. Non-approve re-injects the verdict
#     as context and runs a fix session in place (Ralph "pressure cooker") —
#     it never bounces back to Phase 1's queue. Round/conflict-fix progress is
#     persisted per issue, so a review that outlives one run resumes instead
#     of getting a fresh budget.
#   Exhausted attempts/rounds → "blocked" + phone notification (escalation).
#
# STATUS MODEL
#   Project v2 configured: current Sprint iteration + Status are authoritative.
#   No board configured: issue labels remain the backward-compatible queue.
# Labels are still mirrored in Project mode so older automations keep working.
#
# Prereqs on the host: git, gh (authenticated), jq, and Claude Code (`claude`).
# Run from a repo initialised by shipyard. Drive it from your phone via Happy:
#   ./.project/loop/agent-loop.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

LOOP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git rev-parse --show-toplevel)"
STATE="$REPO_ROOT/.project/state.json"

# ── Per-machine settings ─────────────────────────────────────────────────────
# The same project is delivered from more than one machine: a VPS that runs H24
# headless, and a laptop with a human and a browser in front of it. What differs
# between them is never the project — it is paths and toggles. They live in an
# untracked file next to the loop, so moving the work to the other machine is a
# `git pull`, never an edit to something versioned that would then conflict.
if [ -f "$LOOP_DIR/env.local" ]; then
    set -a
    # shellcheck source=/dev/null
    source "$LOOP_DIR/env.local"
    set +a
fi

# shellcheck source=/dev/null
source "$LOOP_DIR/claude-invoke.sh"

# ── Config (overridable via env) ─────────────────────────────────────────────
: "${SHIPYARD_BASE:=develop}"                 # integration branch
: "${SHIPYARD_TODO_LABEL:=status:todo}"
: "${SHIPYARD_WIP_LABEL:=status:in-progress}"
: "${SHIPYARD_REVIEW_LABEL:=status:in-review}"
: "${SHIPYARD_BLOCKED_LABEL:=status:blocked}"
: "${SHIPYARD_REVIEW_MODEL:=opus}"           # T45 may use haiku to minimise quota
: "${SHIPYARD_PROJECT_LIMIT:=1200}"
: "${SHIPYARD_REVIEW_COMMENT_MAX_CHARS:=3000}"  # keep review feedback on the PR short
: "${SHIPYARD_MAX_CONFLICT_FIXES:=2}"        # base re-integrations per review loop
: "${SHIPYARD_MAX_CI_TIMEOUT_RETRIES:=2}"    # extra CI waits before treating a timeout as real

# ── Local quality gates (the push-to-github skill, run deterministically) ────
# A gate an agent is merely asked to run is an intention; a gate the orchestrator
# runs is a guarantee. Everything below turns the project's own commands — the
# ones the skills document and CI executes — into a pre-push checkpoint, so a
# lint/test/build failure costs one fix session instead of a CI run plus a full
# review round.
: "${SHIPYARD_LOCAL_GATES:=1}"               # 0 = skip the pre-push gate entirely
: "${SHIPYARD_LOCAL_GATES_BLOCKING:=0}"      # 1 = escalate instead of letting CI arbitrate
: "${SHIPYARD_LOCAL_GATE_TIMEOUT:=1200}"     # seconds, per gate command
: "${SHIPYARD_LOCAL_GATE_LOG_LINES:=40}"     # tail kept from a failing gate
: "${SHIPYARD_MAX_GATE_FIXES:=2}"            # fix sessions per issue before giving up

# ── Visual gate ──────────────────────────────────────────────────────────────
# Lint, test and build prove the code runs. They say nothing about what the user
# actually sees, which is where an end-to-end regression hides in plain sight: a
# layout that collapsed, a component that renders empty, a design that drifted
# from what was approved. The gate renders the declared screens and compares them
# to the designs a human has approved — and nothing else, because a baseline the
# loop could approve for itself would prove nothing.
: "${SHIPYARD_VISUAL_GATE:=1}"               # 0 = never capture
: "${SHIPYARD_VISUAL_STRICT:=0}"             # 1 = an app that never boots is a red gate
: "${SHIPYARD_MAX_PR_DIFF_LINES:=400}"       # create-pr's size reflex (advisory)

# ── Triage of blocked issues (Phase 0) ──────────────────────────────────────
# An escalation is a hypothesis, not a verdict: it was raised by one session that
# had a single issue in front of it, and it ages badly — the PR it waited on gets
# merged, the human answers in a comment, the duplicate is closed. Nothing re-read
# those hypotheses, so `blocked` was a one-way door and the queue only ever grew.
#
# Phase 0 re-judges each one against the CURRENT state of the repository (PR, CI,
# dependency chain, human replies) and leaves `blocked` only what a human alone can
# supply — a secret, a missing business datum, a product decision, an external
# action. Everything else goes back into the queues the same run. The agent judges;
# THIS script applies the decision — labels, merges and closes are never delegated.
: "${SHIPYARD_TRIAGE:=1}"                    # 0 = never re-judge blocked issues
: "${SHIPYARD_TRIAGE_MODEL:=opus}"           # it arbitrates rather than codes: Opus
: "${SHIPYARD_MAX_TRIAGE_PER_RUN:=5}"        # blocked issues examined per run
: "${SHIPYARD_TRIAGE_MAX_PASSES:=3}"         # passes before a stable ask goes quiet
: "${SHIPYARD_TRIAGE_MAX_REQUEUE:=2}"        # sibling issues released per decision
: "${SHIPYARD_TRIAGE_MAX_REFS:=8}"           # referenced issues resolved for context
: "${SHIPYARD_TRIAGE_ALLOW_FIX:=1}"          # 0 = the arbiter never pushes code

MAX_ITERS="$(jq -r '.loop.max_iterations_per_sprint // 50' "$STATE")"
MAX_ATTEMPTS="$(jq -r '.loop.max_attempts_per_issue // 3' "$STATE")"
MAX_REVIEW="$(jq -r '.loop.max_review_rounds // 4' "$STATE")"
# How many issues the review phase processes per run. Falls back to
# max_iterations_per_sprint (not a hardcoded number) so a state.json that
# already customized that field behaves sanely without knowing about this key.
MAX_REVIEW_ISSUES_PER_RUN="$(jq -r '.loop.max_review_issues_per_run // .loop.max_iterations_per_sprint // 50' "$STATE")"

# Worktree parallelism (P5.3): how many issues to process concurrently. Default 1
# = fully sequential (unchanged behaviour). Each issue already lives in its own
# worktree (.worktrees/issue-<n>) + branch feat/<n>, so they don't collide; the
# shared state.json, worktree creation, and PR merges are serialized with flock.
: "${SHIPYARD_PARALLELISM:=1}"

# ── Notifications (phone alerts via the bundled notifier or a custom command) ─
# Auto-use .project/loop/notify.sh when present and nothing else is configured, so
# escalations reach your phone without extra wiring (see docs/REMOTE.md).
if [ -z "${SHIPYARD_NOTIFY_CMD:-}" ] && [ -x "$LOOP_DIR/notify.sh" ]; then
    SHIPYARD_NOTIFY_CMD="$LOOP_DIR/notify.sh"
fi
shipyard_notify() {
    local msg; msg="$(printf '%s' "$1" | shipyard_redact)"
    echo "🔔 $msg"
    [ -n "${SHIPYARD_NOTIFY_CMD:-}" ] && "${SHIPYARD_NOTIFY_CMD}" "$msg" 2>/dev/null || true
}
log() { echo "── $*"; }

# ── state.json helpers (best-effort, atomic) ─────────────────────────────────
# All state mutations are serialized with flock (_with_lock, from claude-invoke.sh)
# so concurrent process_issue_dev workers (SHIPYARD_PARALLELISM>1) can't lose updates.
# NB: the *_unlocked bodies must never call another locked helper — nesting the
# same lock file would self-deadlock flock. Each locked helper is self-contained.
_state_set() { _with_lock "${STATE}.lock" _state_set_unlocked "$1"; }
_state_set_unlocked() {   # _state_set_unlocked <jq-expression>
    local tmp="$STATE.tmp.$$"
    jq "$1" "$STATE" >"$tmp" && mv "$tmp" "$STATE"
}
# A ticket id is a NUMBER on GitHub and a STRING in the vault, and everything
# the loop persists — attempts, review rounds, triage passes, blockers — is
# keyed by it. Emit the JSON form the id actually has: digits stay a number, so
# an existing state file keeps its shape byte for byte, and anything else
# becomes a quoted string instead of an invalid jq program. Passing `APP-001`
# to --argjson used to abort the whole review budget read, which then compared
# an empty round against an integer and escalated a perfectly healthy ticket.
_id_json() {  # _id_json <id> → a JSON scalar
    case "$1" in
        ''|*[!0-9]*) jq -nc --arg v "$1" '$v' ;;
        *)           printf '%s' "$1" ;;
    esac
}
set_current_issue() {
    local v; if [ -z "${1:-}" ]; then v=null; else v="$(_id_json "$1")"; fi
    _state_set ".loop.current_issue=$v | .loop.status=\"running\""
}
bump_attempt() { _with_lock "${STATE}.lock" _bump_attempt_unlocked "$1"; }  # echoes new count
_bump_attempt_unlocked() {
    local n="$1" cur tmp="$STATE.tmp.$$"
    cur="$(jq -r ".loop.attempts[\"$n\"] // 0" "$STATE")"
    cur=$((cur + 1))
    jq ".loop.attempts[\"$n\"]=$cur" "$STATE" >"$tmp" && mv "$tmp" "$STATE"
    echo "$cur"
}
# Record a structured blocker (issue + kind + human-readable cause + the exact
# command the human should run). Uses --arg so reason/remediation can contain any
# characters. Keeps escalated_issues (numbers) for backward-compat.
_record_blocker() { _with_lock "${STATE}.lock" _record_blocker_unlocked "$@"; }
_record_blocker_unlocked() {  # _record_blocker <issue> <kind> <reason> <remediation>
    local n="$1" kind="$2" reason="$3" rem="$4" tmp="$STATE.tmp.$$"
    # Both lists are sets keyed on the issue, not append-only journals. Escalating
    # the same issue twice used to leave two entries, so `blockers` counted the
    # same pending action several times and `escalated_issues` read [55,55,56,57,
    # 59,61,55,…]. One entry per issue, carrying the most recent cause.
    jq --argjson n "$(_id_json "$n")" --arg k "$kind" --arg r "$reason" --arg m "$rem" \
       '.loop.escalated_issues = (((.loop.escalated_issues // []) + [$n]) | unique)
        | .loop.status="blocked"
        | .loop.blockers = (((.loop.blockers // []) | map(select(.issue != $n)))
                            + [{issue:$n,kind:$k,reason:$r,remediation:$m}])' \
       "$STATE" >"$tmp" 2>/dev/null && mv "$tmp" "$STATE" || rm -f "$tmp"
}

# The other half of the lifecycle, which never existed: nothing removed an entry
# when the human actually did the thing it asked for. `blockers` — the list the
# retrospective reports as "blocages en attente" — therefore only ever grew, and
# ended up describing issues closed days earlier.
_clear_blocker() { _with_lock "${STATE}.lock" _clear_blocker_unlocked "$@"; }
_clear_blocker_unlocked() {  # _clear_blocker <issue>
    local n="$1" tmp="$STATE.tmp.$$"
    jq --argjson n "$(_id_json "$n")" \
       '.loop.blockers = ((.loop.blockers // []) | map(select(.issue != $n)))
        | .loop.escalated_issues = ((.loop.escalated_issues // []) | map(select(. != $n)))' \
       "$STATE" >"$tmp" 2>/dev/null && mv "$tmp" "$STATE" || rm -f "$tmp"
}

# Review-loop progress (round / conflict_fixes), keyed by issue. The dev/review
# split means the review loop is no longer a single in-memory pass inside one
# process_issue_review() call — it can be resumed by a later run (recover_in_flight)
# or by the next review-phase scan. Without persisting this, every resume
# granted a fresh MAX_REVIEW budget, which is what made a REVIEW-labeled issue
# recovered at startup re-run a whole dev session for nothing (it also reset
# the round count, so `escalate` never actually triggered from real exhaustion
# — only from a lucky/unlucky streak within a single invocation).
_review_state_get() {  # _review_state_get <issue> -> "round<TAB>conflict_fixes"
    local n="$1"
    jq -r --argjson n "$(_id_json "$n")" \
       '(.loop.review[($n|tostring)] // {round:0,conflict_fixes:0})
        | "\(.round // 0)\t\(.conflict_fixes // 0)"' "$STATE"
}
_review_state_set() { _with_lock "${STATE}.lock" _review_state_set_unlocked "$@"; }
_review_state_set_unlocked() {  # <issue> <round> <conflict_fixes>
    local n="$1" round="$2" cf="$3" tmp="$STATE.tmp.$$"
    jq --argjson n "$(_id_json "$n")" --argjson r "$round" --argjson c "$cf" \
       '.loop.review[($n|tostring)] = {round:$r, conflict_fixes:$c}' \
       "$STATE" >"$tmp" 2>/dev/null && mv "$tmp" "$STATE" || rm -f "$tmp"
}
_review_state_clear() { _with_lock "${STATE}.lock" _review_state_clear_unlocked "$@"; }
_review_state_clear_unlocked() {  # <issue>
    local n="$1" tmp="$STATE.tmp.$$"
    jq --argjson n "$(_id_json "$n")" 'del(.loop.review[($n|tostring)])' \
       "$STATE" >"$tmp" 2>/dev/null && mv "$tmp" "$STATE" || rm -f "$tmp"
}

# Same shape, for the triage phase. Three things are remembered per issue: how many
# times it has been re-judged (a budget), how many comments the issue carried at
# that moment (so a human ANSWER is what re-opens the budget), and the exact ask
# that was last sent to the human (so an unchanged ask never notifies twice —
# re-posting the same escalation every run is how a notification channel becomes
# noise the operator stops reading).
# `merged` is the fourth: the delivery counter at the time of the pass. It is what
# lets a chain link be re-judged when its dependency actually lands — see
# _triage_should_run.
_triage_state_get() {  # _triage_state_get <issue> -> "passes<TAB>comments<TAB>merged<TAB>ask"
    local n="$1"
    jq -r --argjson n "$(_id_json "$n")" \
       '(.loop.triage[($n|tostring)] // {})
        | "\(.passes // 0)\t\(.comments // 0)\t\(.merged // 0)\t\(.ask // "")"' "$STATE" 2>/dev/null \
        || printf '0\t0\t0\t'
}
_triage_state_set() { _with_lock "${STATE}.lock" _triage_state_set_unlocked "$@"; }
_triage_state_set_unlocked() {  # <issue> <passes> <comments> <ask>
    local n="$1" passes="$2" comments="$3" ask="$4" tmp="$STATE.tmp.$$"
    jq --argjson n "$(_id_json "$n")" --argjson p "$passes" --argjson c "$comments" --arg a "$ask" \
       '.loop.triage[($n|tostring)] =
          {passes:$p, comments:$c, ask:$a, merged:(.loop.merged_total // 0)}' \
       "$STATE" >"$tmp" 2>/dev/null && mv "$tmp" "$STATE" || rm -f "$tmp"
}
_triage_state_clear() { _with_lock "${STATE}.lock" _triage_state_clear_unlocked "$@"; }
_triage_state_clear_unlocked() {  # <issue>
    local n="$1" tmp="$STATE.tmp.$$"
    jq --argjson n "$(_id_json "$n")" 'del(.loop.triage[($n|tostring)])' \
       "$STATE" >"$tmp" 2>/dev/null && mv "$tmp" "$STATE" || rm -f "$tmp"
}

# ── Ticket tracker ───────────────────────────────────────────────────────────
# Where the tickets live is a BACKEND, not a hardcoded assumption: every read and
# write against the tracker below goes through the `ticket_*` contract. Sourced
# here, after the config and the state helpers it builds on, and before the first
# function that uses it. See ticket-backend.sh for the contract and the reasoning.
# shellcheck source=/dev/null
source "$LOOP_DIR/ticket-backend.sh"

# Startup reconciliation. An issue a human closed or relabelled out of band never
# comes back through process_issue_dev/_review, so clearing on claim alone would leave its
# entry forever — exactly what happened to #78, fixed and closed by hand while the
# loop still reported it as waiting. Best-effort: an unreadable issue is left
# alone, so an API hiccup can never empty the list.
#
# Two mirrors have to be reconciled, not one. Clearing `.loop.blockers` fixes what
# the retrospective counts, but the vault sprint file is what the operator reads —
# and the only write-back path was process_issue_review's own merge step. Every issue a
# human merged by hand after an escalation (#55, #56, #57, #59 on sprint 001) left
# the vault frozen on 🔴 bloquée while the board said Done. So the same pass also
# restamps the sprint task, which is what makes the vault self-heal.
#
# The candidate set is every issue the loop has touched — blockers, escalations and
# attempt counters — not just the blocked ones: an issue closed by hand while it was
# still `in-progress` never appears in `blockers`, and used to stay 🟡 en cours in the
# vault forever.
reconcile_out_of_band() {
    local n info st reason blocked pruned=0 pr detail
    # Everything is compared as a STRING here: the two lists hold the id as the
    # backend writes it (a number on GitHub) while the two maps hold it as an
    # object key (always a string), and `tonumber?` used to reconcile the two by
    # discarding whatever would not convert — which silently dropped every vault
    # id from the candidate set, leaving each one's blocker entry forever.
    # Read line by line rather than word-split: an id is not guaranteed to be
    # free of whitespace just because it is usually `APP-001`.
    while IFS= read -r n; do
        [ -n "$n" ] || continue
        info="$(ticket_meta "$n")" || continue
        [ -n "$info" ] || continue
        st="$(jq -r '.state // empty' <<<"$info" 2>/dev/null)" || continue
        [ -n "$st" ] || continue
        blocked="$(jq -r --arg l "$SHIPYARD_BLOCKED_LABEL" \
                     '([.labels[].name] | index($l)) != null' <<<"$info" 2>/dev/null)" || blocked=true

        if [ "$st" = CLOSED ]; then
            reason="$(jq -r '.stateReason // empty' <<<"$info" 2>/dev/null)"
            if [ "$reason" = NOT_PLANNED ]; then
                # Abandoned, not delivered: drop the stale badge without ticking the box.
                vault_task_status "$n" todo
            else
                # Name the PR that closed it, exactly as the merge path would have.
                pr="$(ticket_closing_pr "$n")"
                detail=""; [ -n "$pr" ] && detail="PR #$pr"
                vault_task_status "$n" done "$detail"
            fi
        fi

        if [ "$st" = CLOSED ] || [ "$blocked" != "true" ]; then
            _clear_blocker "$n"
            _review_state_clear "$n"
            pruned=$((pruned + 1))
        fi
    done < <(jq -r '[(.loop.blockers // [])[].issue]
                    + (.loop.escalated_issues // [])
                    + ((.loop.attempts // {}) | keys)
                    + ((.loop.review // {}) | keys)
                    | map(select(. != null) | tostring) | unique | .[]' "$STATE" 2>/dev/null)
    [ "$pruned" -eq 0 ] || log "blocages périmés purgés : $pruned (issue close ou débloquée hors boucle)"
}

# Map an error blob to (reason, remediation). This is what turns an opaque
# "blocked" into "here is the exact command YOU need to run". Fields are joined
# with a unit-separator (0x1f) so neither can be split accidentally.
classify_blocker() {  # classify_blocker <text>  → "reason<US>remediation"
    local t="$1" reason rem
    if grep -qiE 'required scopes|missing.*scope|read:project|project.*scope|gh auth refresh' <<<"$t"; then
        reason="le jeton GitHub n'a pas le scope requis (ex. Projects v2)"
        rem="gh auth refresh -s project -s read:project"
    elif grep -qiE 'protected branch|branch protection|required status check|not allowed to push|GH006' <<<"$t"; then
        reason="une règle de protection de branche bloque le push/merge sur $SHIPYARD_BASE"
        rem="ajuste la protection de la branche $SHIPYARD_BASE (Settings → Branches) puis remets le label $SHIPYARD_TODO_LABEL"
    elif grep -qiE 'HTTP 40[13]|forbidden|not authorized|must have admin|permission|insufficient' <<<"$t"; then
        reason="permissions GitHub insuffisantes (droits repo / environnement)"
        rem="vérifie tes droits sur le repo, puis: gh auth status  (et gh auth refresh si besoin)"
    elif grep -qiE 'secret|credential|unauthorized|HTTP 401|token .* (not set|invalid)|env(ironment)? var' <<<"$t"; then
        reason="un secret / identifiant est manquant ou invalide"
        rem="ajoute le secret manquant (ex. gh secret set <NOM>) puis remets le label $SHIPYARD_TODO_LABEL"
    else
        reason="blocage non catégorisé (voir logs de la boucle)"
        rem="inspecte la PR/issue et les logs, corrige, puis remets le label $SHIPYARD_TODO_LABEL"
    fi
    printf '%s\x1f%s' "$reason" "$rem"
}

# ── Vault write-back ─────────────────────────────────────────────────────────
# The vault is where the operator reads progress, so every transition the loop
# makes on GitHub is mirrored back into the sprint file. Best-effort by design:
# an unreadable or unwritable vault must never stall a delivery.
vault_task_status() {  # vault_task_status <issue> <state> [detail]
    [ "${SHIPYARD_VAULT_WRITEBACK:-1}" != 0 ] || return 0
    local helper="$LOOP_DIR/vault-task-status.sh" out
    [ -x "$helper" ] || return 0
    out="$(_with_lock "$REPO_ROOT/.project/.vault.lock" "$helper" "$1" "$2" "${3:-}" 2>&1)" \
        || out="vault write-back failed for issue #$1"
    [ -n "$out" ] && log "$out"
    return 0
}

# Headline of the escalation comment — and the marker human_replies() searches for
# to find where the human's answer starts. Single source so the two cannot drift.
SHIPYARD_ESCALATION_MARKER='Besoin humain — la boucle est en pause sur cette issue'

# Unified escalation: label → blocked, record the structured blocker, COMMENT on
# the issue with the exact remediation command, and notify. One place, so every
# dead-end tells the human precisely what to do.
escalate() {  # escalate <issue> <kind> <reason> <remediation> [from-label]
    local n="$1" kind="$2" reason="$3" rem="$4" from="${5:-$SHIPYARD_WIP_LABEL}" resume
    reason="$(printf '%s' "$reason" | shipyard_redact)"
    rem="$(printf '%s' "$rem" | shipyard_redact)"
    # Resume where the issue was escalated FROM, not always at the start of the dev
    # phase. This text used to be hardcoded to status:todo: an issue escalated during
    # review — its PR already open, its work already pushed — was sent back to the dev
    # queue, where the next pass could only produce an empty diff and re-escalate
    # "no-output". #138/PR #149 ping-ponged between todo and blocked for hours that way
    # and never once reached the conflict resolver. Anything escalated from review goes
    # back to review; everything else starts over in todo.
    if [ "$from" = "$SHIPYARD_REVIEW_LABEL" ]; then resume="$SHIPYARD_REVIEW_LABEL"; else resume="$SHIPYARD_TODO_LABEL"; fi
    # Re-escalating an issue that is ALREADY blocked (the triage phase refreshing a
    # human ask) must not ask gh to remove and add the same label in one call: the
    # two are separate API mutations, and losing that race strips the only label
    # every queue reads, making the issue invisible to the loop entirely.
    if [ "$from" = "$SHIPYARD_BLOCKED_LABEL" ]; then
        ticket_set_status "$n" "" "$SHIPYARD_BLOCKED_LABEL"
    else
        ticket_set_status "$n" "$from" "$SHIPYARD_BLOCKED_LABEL"
    fi
    _record_blocker "$n" "$kind" "$reason" "$rem"
    # max_attempts_per_issue is a per-cycle budget, not a lifetime cap. Without this
    # reset, bump_attempt() pushes the counter further past MAX_ATTEMPTS on the very
    # next retry — even right after a human fixes the real blocker — so the issue
    # re-escalates instantly forever. Every escalation path funnels through here, so
    # resetting once, here, fixes it for all of them.
    _state_set ".loop.attempts[\"$n\"]=0"
    _review_state_clear "$n"
    vault_task_status "$n" blocked "$kind"
    local body
    body="$(printf '🚧 **%s**\n\n- **Type** : %s\n- **Cause** : %s\n- **Action à lancer par toi** :\n\n```bash\n%s\n```\n\nQuand c'\''est réglé, remets le label `%s` sur cette issue pour relancer la boucle.' \
        "$SHIPYARD_ESCALATION_MARKER" "$kind" "$reason" "$rem" "$resume")"
    ticket_comment "$n" "$body"
    [ -n "${RUN_LEDGER:-}" ] && printf 'escalated\t%s\t%s\t%s\n' "$n" "$kind" "$reason" >>"$RUN_LEDGER" 2>/dev/null || true
    shipyard_notify "🚧 Issue $(ticket_ref "$n") bloquée ($kind) — à lancer: $rem"
}

# The reviewer's actual verdict used to live only in memory (fed back into the next
# fix round, then discarded) — a human landing on "review-exhausted" found a CI-green
# PR with an empty discussion and no way to tell what was rejected. Post it on the PR
# instead, every non-approve round, bounded so a verbose reviewer can't blow up the
# PR thread or whoever reads it next.
post_review_comment() {  # post_review_comment <pr> <round> <max-round> <verdict> <text>
    local pr="$1" round="$2" max="$3" verdict="$4" text body
    text="$(printf '%s' "$5" | shipyard_redact)"
    if [ "${#text}" -gt "$SHIPYARD_REVIEW_COMMENT_MAX_CHARS" ]; then
        # Cut on the last line boundary, never mid-sentence: a point severed in
        # half still reads as a whole one and sends the dev after the wrong
        # thing. Say how much was dropped — a silent "… (tronqué)" left the
        # reader unable to tell a verbose reviewer from a lost review point.
        local dropped=$(( ${#text} - SHIPYARD_REVIEW_COMMENT_MAX_CHARS ))
        text="${text:0:$SHIPYARD_REVIEW_COMMENT_MAX_CHARS}"
        [[ "$text" == *$'\n'* ]] && text="${text%$'\n'*}"
        text="$text

… (retour tronqué : $dropped caractères au-delà de la limite de $SHIPYARD_REVIEW_COMMENT_MAX_CHARS — le reviewer devait tenir dans ce budget)"
    fi
    body="$(printf '🔍 **Review automatique — tour %s/%s** : `%s`\n\n%s' "$round" "$max" "$verdict" "$text")"
    gh pr comment "$pr" --body "$body" >/dev/null 2>&1 || true
}

# The other half of the escalation protocol. escalate() asks the human a question
# as an issue COMMENT — but the dev session only ever received the issue BODY, so
# the answer never reached the session meant to act on it. Issues therefore
# re-escalated demanding information the human had already supplied.
#
# Pass exactly the slice that answers the question: the comments posted AFTER the
# last escalation. Bounded by construction — an issue that was never escalated
# contributes nothing, and a long loop-generated history before the escalation
# costs no tokens either.
: "${SHIPYARD_REPLY_MAX_CHARS:=8000}"
human_replies() {  # human_replies <issue> — echoes a context block, or nothing
    local n="$1" out
    out="$(ticket_replies_after "$n" "$SHIPYARD_ESCALATION_MARKER")" || return 0
    [ -n "$out" ] || return 0
    if [ "${#out}" -gt "$SHIPYARD_REPLY_MAX_CHARS" ]; then
        out="${out:0:$SHIPYARD_REPLY_MAX_CHARS}
… (réponses tronquées à $SHIPYARD_REPLY_MAX_CHARS caractères)"
    fi
    printf '\n## Réponses humaines depuis la dernière escalade\n\nCes commentaires ont été postés APRÈS la dernière demande `needs-human` : ils répondent à cette demande. Traite-les comme faisant partie de l'\''énoncé de l'\''issue.\n\n%s\n' "$out"
}

# Same failure mode as human_replies(), one level up. A review verdict was only
# ever alive inside the review loop: re-injected into the next fix round, then
# dropped. So an issue that exhausted its rounds, got unblocked by a human and was
# picked again started from the issue body alone — the dev session never saw that
# a reviewer had already rejected this exact branch, and rebuilt the same PR.
#
# Rebuild that memory from the durable record: the PR itself. Its review comments
# (posted by post_review_comment) plus the CURRENT state of the branch — CI and
# mergeability — are what the session needs before it writes a line of code.
: "${SHIPYARD_PR_FEEDBACK_MAX_CHARS:=6000}"
pr_feedback() {  # pr_feedback <issue> <branch> — echoes a context block, or nothing
    local n="$1" branch="$2" pr comments mergeable out=""
    pr="$(gh pr list --head "$branch" --state open --json number --jq '.[0].number // empty' 2>/dev/null)" || return 0
    [ -n "$pr" ] || return 0

    comments="$(gh pr view "$pr" --json comments --jq '
        [ (.comments // [])[] | select(.body | startswith("🔍")) ] | last
        | if . == null then "" else "#### \(.createdAt)\n\n\(.body)" end' 2>/dev/null)" || comments=""

    mergeable="$(gh pr view "$pr" --json mergeable --jq '.mergeable' 2>/dev/null || echo UNKNOWN)"

    out="## État de la PR #$pr (déjà ouverte pour cette issue)

Cette issue a **déjà** une branche \`$branch\` et une PR ouverte : tu reprends un travail en cours, tu ne repars pas de zéro. Lis ce qui suit AVANT de coder.
"
    if [ -n "$comments" ]; then
        out+="
### Dernier retour de review (à corriger en priorité)

$comments
"
    fi
    if [ "$mergeable" = "CONFLICTING" ]; then
        out+="
### La branche est en CONFLIT avec \`$SHIPYARD_BASE\`

Tant que ce conflit existe, la PR ne peut pas être mergée et la CI juge un arbre qui ne sera jamais intégré. **Commence par là** : \`git fetch origin $SHIPYARD_BASE\` puis \`git rebase origin/$SHIPYARD_BASE\`, résous les conflits en gardant les deux intentions, et enchaîne les étapes avec \`git rebase --continue\` jusqu'au bout. Pendant un rebase, \`ours\` désigne \`$SHIPYARD_BASE\` et \`theirs\` ton commit en cours de rejeu : ne te fie pas à ces noms, lis le contenu. Le rebase réécrit tes commits, donc le push devra être \`--force-with-lease\` — jamais \`--force\`.
"
    fi
    if ! ci_is_green_now "$pr"; then
        local ci_report=""
        ci_report="$(ci_failure_report "$pr")" || ci_report=""
        if [ -n "$ci_report" ]; then
            out+="
### CI actuelle

$ci_report
"
        fi
    fi

    if [ "${#out}" -gt "$SHIPYARD_PR_FEEDBACK_MAX_CHARS" ]; then
        out="${out:0:$SHIPYARD_PR_FEEDBACK_MAX_CHARS}
… (état de la PR tronqué à $SHIPYARD_PR_FEEDBACK_MAX_CHARS caractères)"
    fi
    printf '\n%s\n' "$out"
}

loop_is_paused() {
    jq -e '.loop.status == "paused"' "$STATE" >/dev/null 2>&1
}

# Stable stack knowledge, injected into every agent prompt so the model doesn't
# rediscover the toolchain each fresh session. Reads .stack_profile from state.json;
# emits nothing when absent (backward-compatible with minimal state files).
stack_context() {
    [ -f "$STATE" ] || return 0
    jq -r '
      .stack_profile // empty
      | [ "## Stack du projet (contexte stable — ne pas redécouvrir)",
          (if (.languages // []) | length > 0 then "- Langages : " + (.languages | join(", ")) else empty end),
          (if .package_manager then "- Gestionnaire de paquets : " + .package_manager else empty end),
          ((.commands // {}) | to_entries
             | map(select(.value != null and .value != ""))
             | map("- commande `" + .key + "` : `" + .value + "`") | .[]),
          (if .notes then "- Notes : " + .notes else empty end)
        ]
      | map(select(. != null)) | join("\n")
    ' "$STATE" 2>/dev/null
}

# Resolve an issue's single pkg:<name> label to the explicit monorepo package
# table in state.json. With no package label the loop remains repo-wide for
# backward compatibility. An ambiguous or unknown label fails closed.
package_scope_for_issue() { # <issue> -> path, rc 0; rc 2 ambiguous; rc 3 unknown
    local n="$1" labels count name path
    labels="$(ticket_labels "$n" \
      | jq -c '[.[] | select(startswith("pkg:")) | ltrimstr("pkg:")] | unique' 2>/dev/null || echo '[]')"
    count="$(jq -r 'length' <<<"$labels" 2>/dev/null || echo 0)"
    [ "$count" -eq 0 ] && return 0
    [ "$count" -eq 1 ] || return 2
    name="$(jq -r '.[0]' <<<"$labels")"
    path="$(jq -r --arg name "$name" '
      (.stack_profile.packages // [])[]?
      | select((.name // "") == $name or (.label // "") == ("pkg:" + $name))
      | .path // empty' "$STATE" 2>/dev/null | head -1)"
    # Conventional fallback keeps older monorepo state files useful, but only
    # when the directory actually exists. Explicit state remains authoritative.
    #
    # "$name" bare — no apps/packages/infra prefix — covers a package that lives
    # at the repository root, `infra/` matched by `pkg:infra` being the common
    # case. Trying only the nested conventions made such an issue escalate as
    # "unknown package" forever, since `infra/infra` never exists.
    if [ -z "$path" ]; then
        for path in "apps/$name" "packages/$name" "infra/$name" "$name"; do
            [ -d "$REPO_ROOT/$path" ] && break
            path=""
        done
    fi
    [ -n "$path" ] || return 3
    case "$path" in /*|*'..'*) return 3 ;; esac
    printf '%s' "${path%/}"
}

package_scope_context() { # <pkg-path>
    local path="$1" shared
    [ -n "$path" ] || return 0
    shared="$(jq -r '(.stack_profile.shared_paths // []) | map("`" + . + "`") | join(", ")' "$STATE" 2>/dev/null)"
    printf '\n\n## Périmètre monorepo imposé\n- Package ciblé : `%s`\n- Modifie uniquement ce chemin et ses descendants.' "$path"
    [ -n "$shared" ] && printf '\n- Fichiers racine partagés autorisés : %s' "$shared"
    printf '\n- Toute modification hors périmètre sera rejetée automatiquement avant la PR.\n'
}

package_diff_violations() { # <worktree> <pkg-path>; reads the staged diff
    local wt="$1" scope="$2" file allowed shared core docs_root=""
    [ -n "$scope" ] || return 0
    shared="$(jq -c '.stack_profile.shared_paths // []' "$STATE" 2>/dev/null || echo '[]')"
    # The documentation pass is run by the ORCHESTRATOR, not by the agent, and it
    # writes under the project's documentation root — which is almost never inside
    # the package being worked on (`apps/docs/docs` while the issue is scoped to
    # `apps/api`, say). Counting those files as an out-of-scope change made the
    # loop reject its own writes: a perfectly scoped delivery escalated as
    # `package-scope`, listing files the agent never touched.
    core="${CLAUDE_HOME:-$HOME/.claude}/shipyard/bin"
    if [ -x "$core/detect-docs-target.sh" ]; then
        docs_root="$( ( cd "$wt" && "$core/detect-docs-target.sh" . 2>/dev/null ) \
                      | jq -r '.docs_root // empty' 2>/dev/null )" || docs_root=""
    fi
    docs_root="${docs_root%/}"
    git -C "$wt" diff --cached --name-only --diff-filter=ACMR | while IFS= read -r file; do
        allowed=0
        case "$file" in "$scope"|"$scope"/*) allowed=1 ;; esac
        # `shared_paths` holds DIRECTORIES (`packages/shared-types`) while a diff
        # only ever lists files, so an `index($f)` equality test could never match
        # and the list authorized nothing at all. package_scope_context() still
        # announced those paths to the agent as allowed — it edited them as told,
        # then had its delivery rejected. Prefix test, like "$scope" above.
        #
        # `. as $s` is required: after the pipe into startswith, `.` would rebind
        # to $f and the test would compare $f against itself.
        if [ "$allowed" = 0 ] && jq -e --arg f "$file" \
             'any(.[]; . as $s | $s == $f or ($f | startswith($s + "/")))' \
             <<<"$shared" >/dev/null 2>&1; then
            allowed=1
        fi
        if [ "$allowed" = 0 ] && [ -n "$docs_root" ]; then
            case "$file" in "$docs_root"|"$docs_root"/*) allowed=1 ;; esac
        fi
        [ "$allowed" = 1 ] || printf '%s\n' "$file"
    done
}

# ── Local quality gates — the push-to-github skill, run deterministically ────
# The skills document exactly which commands CI replays. Asking the agent to run
# them is an intention it can forget under context pressure; running them here is
# a guarantee. Everything below is driven by .stack_profile.commands, so it stays
# correct for any stack without the loop knowing what pnpm or turbo are.

stack_command() {  # stack_command <key> → the project's command for that gate
    local key="$1" override
    # SHIPYARD_GATE_<KEY> wins over state.json. A deployment can then point a gate
    # at the exact script CI runs — the whole point being that a gate green here
    # and red on the PR is a bug in the gate list, not in the code — without
    # waiting for a state.json change to reach the running loop's checkout.
    override="SHIPYARD_GATE_$(printf '%s' "$key" | tr 'a-z-' 'A-Z_')"
    if [ -n "${!override-}" ]; then printf '%s' "${!override}"; return 0; fi
    [ -f "$STATE" ] || return 0
    jq -r --arg k "$key" '(.stack_profile.commands // {})[$k] // empty' "$STATE" 2>/dev/null || true
}

# The dependency audit is a gate only when a manifest or a lockfile moved. Run
# unconditionally it would tax every iteration, and a pre-existing advisory would
# start blocking issues that never touched a dependency.
gate_touches_manifest() {  # gate_touches_manifest <worktree>
    git -C "$1" status --porcelain 2>/dev/null | awk '{print $NF}' | grep -qiE \
        '(^|/)(package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock|composer\.(json|lock)|requirements\.txt|poetry\.lock|Pipfile\.lock|go\.(mod|sum)|Cargo\.(toml|lock)|Gemfile\.lock)$'
}

_gate_failure_report() {  # _gate_failure_report <label> <command> <rc> <output>
    local label="$1" cmd="$2" rc="$3" out="$4" tail_out hint=""
    [ "$rc" -eq 124 ] && hint=" (délai de ${SHIPYARD_LOCAL_GATE_TIMEOUT}s dépassé)"
    # `|| tail_out=…` is load-bearing under `set -e -o pipefail`: this runs inside
    # a plain assignment in the caller, so a failing pipeline here would kill the
    # loop instead of reporting a failing gate.
    tail_out="$(printf '%s' "$out" | sed -e 's/\x1b\[[0-9;]*m//g' \
                | tail -n "$SHIPYARD_LOCAL_GATE_LOG_LINES" | shipyard_redact)" \
        || tail_out='(sortie du gate illisible)'
    printf 'Le gate local **%s** est rouge%s — la branche n%sa pas encore été publiée.\n\n' \
        "$label" "$hint" "'"
    printf 'Commande : `%s` (code de sortie %s).\n\n' "$cmd" "$rc"
    printf 'C%sest exactement la commande que la CI rejoue : tant qu%selle échoue ici, la PR sera rouge.\n' "'" "'"
    printf 'Corrige la cause réelle — ne désactive ni le gate, ni la règle, ni le test.\n\n'
    printf '```\n%s\n```\n' "$tail_out"
}

# ── Visual gate ──────────────────────────────────────────────────────────────
# Renders the screens declared in the screenshot manifest from the branch under
# test and compares them to the approved designs. Captures are written to the
# MAIN checkout, never the worktree: an escalation points at a diff image, and
# the worktree is removed the instant an issue is escalated.
_visual_drift_report() {  # _visual_drift_report <gate-json>
    local out="$1"
    printf 'Le **gate visuel** est rouge : le rendu a dérivé du design approuvé sur %s écran(s).\n\n' \
        "$(jq -r '.drifted' <<<"$out")"
    jq -r '
        .shots[]
        | select(.status != "match" and .status != "pending-approval")
        | if .status == "size-mismatch" then
            "- **\(.id)** — les dimensions ont changé : \(.candidate_size.width)×\(.candidate_size.height) au lieu de \(.baseline_size.width)×\(.baseline_size.height)"
          else
            "- **\(.id)** — \(.diff_pixels) pixels d'\''écart (\(((.diff_ratio // 0) * 10000 | round) / 100)% de la capture)"
          end
        + "\n  - rendu actuel : `\(.candidate)`"
        + "\n  - design approuvé : `\(.baseline)`"
        + (if .diff_image then "\n  - écarts en magenta : `\(.diff_image)`" else "" end)
    ' <<<"$out"
    printf '\n'
    printf 'Ouvre les trois images avant de conclure : ce que le gate signale est ce que verra l%sutilisateur.\n' "'"
    printf 'Corrige le rendu. **Tu n%sapprouves jamais une baseline toi-même** — une référence que\n' "'"
    printf 'la boucle peut réécrire ne prouve plus rien. Si la dérive est voulue par la tâche,\n'
    printf 'dis-le explicitement dans ton rapport : un humain approuvera le nouveau design.\n'
}

_visual_gate_report() {  # _visual_gate_report <worktree>
    # rc 0 — every declared screen matches its approved design
    # rc 1 — drift; an actionable report is on stdout
    # rc 2 — nothing to judge: disabled, not configured, or pending a first approval
    local wt="$1" core out rc

    [ "${SHIPYARD_VISUAL_GATE}" != 0 ] || return 2
    core="${CLAUDE_HOME:-$HOME/.claude}/shipyard/bin"
    [ -x "$core/visual-gate.sh" ] || return 2
    command -v node >/dev/null 2>&1 || return 2

    set +e
    out="$("$core/visual-gate.sh" "$wt" --runs "$REPO_ROOT/.project/visual/runs" 2>/dev/null)"
    rc=$?
    set -e
    jq -e . >/dev/null 2>&1 <<<"$out" || return 2

    case "$rc" in
        0) return 0 ;;
        1) _visual_drift_report "$out"; return 1 ;;
        2)  # Captured, but no approved design to compare against — a new screen,
            # or a first run on this machine. That is a question for a human, not
            # a failure to pin on the branch.
            log "gate visuel : $(jq -r '.pending_approval' <<<"$out") capture(s) en attente d'approbation → $(jq -r '.run_dir' <<<"$out")"
            shipyard_notify "👁️ Gate visuel : $(jq -r '.pending_approval' <<<"$out") capture(s) à approuver"
            return 2 ;;
        4|5)
            # The app never came up, or a capture failed. Non-blocking by default:
            # on a machine missing a local service that is an environment problem,
            # and failing the branch for it would strand correct work.
            if [ "${SHIPYARD_VISUAL_STRICT}" != 0 ]; then
                printf 'Le **gate visuel** n%sa pas pu juger le rendu : %s\n\n' "'" "$(jq -r '.status' <<<"$out")"
                printf '%s\n\n' "$(jq -r '.reason // "aucune raison rapportée"' <<<"$out")"
                printf 'En mode strict, une application qui ne démarre pas est un échec de bout en bout.\n'
                return 1
            fi
            log "gate visuel : $(jq -r '.status' <<<"$out") — $(jq -r '.reason // ""' <<<"$out")"
            return 2 ;;
        *) return 2 ;;
    esac
}

# Run the project's gates against the worktree, in the order push-to-github
# defines them, stopping at the first failure (a red lint makes the rest noise).
#   rc 0 — every applicable gate is green
#   rc 1 — a gate failed; an actionable report is on stdout
#   rc 2 — gates unavailable: disabled, no commands declared, or the toolchain
#          could not be installed. Never the agent's fault, never reported to it.
local_gates_report() {  # local_gates_report <worktree>
    local wt="$1" key cmd out rc ran=0

    [ "${SHIPYARD_LOCAL_GATES}" != 0 ] || return 2
    command -v timeout >/dev/null 2>&1 || { log "gates locaux : \`timeout\` absent, gates ignorés" >&2; return 2; }

    # Install first. A worktree created by `git worktree add` carries no
    # dependency tree, so "the tests failed" would really mean "the toolchain was
    # never installed" — and the agent would go hunting a bug that does not exist.
    cmd="$(stack_command install)"
    if [ -n "$cmd" ]; then
        if ! ( cd "$wt" && timeout "$SHIPYARD_LOCAL_GATE_TIMEOUT" bash -o pipefail -c "$cmd" ) >/dev/null 2>&1; then
            log "gates locaux : \`$cmd\` a échoué (environnement) — gates ignorés, la CI arbitrera" >&2
            return 2
        fi
    fi

    for key in lint test build; do
        cmd="$(stack_command "$key")"
        [ -n "$cmd" ] || continue
        ran=$((ran + 1))
        set +e
        out="$(cd "$wt" && timeout "$SHIPYARD_LOCAL_GATE_TIMEOUT" bash -o pipefail -c "$cmd" 2>&1)"
        rc=$?
        set -e
        [ "$rc" -eq 0 ] && continue
        _gate_failure_report "$key" "$cmd" "$rc" "$out"
        return 1
    done

    cmd="$(stack_command audit)"
    if [ -n "$cmd" ] && gate_touches_manifest "$wt"; then
        ran=$((ran + 1))
        set +e
        out="$(cd "$wt" && timeout "$SHIPYARD_LOCAL_GATE_TIMEOUT" bash -o pipefail -c "$cmd" 2>&1)"
        rc=$?
        set -e
        if [ "$rc" -ne 0 ]; then
            _gate_failure_report audit "$cmd" "$rc" "$out"
            return 1
        fi
    fi

    set +e
    out="$(_visual_gate_report "$wt")"
    rc=$?
    set -e
    if [ "$rc" -eq 1 ]; then
        printf '%s\n' "$out"
        return 1
    fi
    [ "$rc" -eq 0 ] && ran=$((ran + 1))

    [ "$ran" -gt 0 ] || return 2
    return 0
}

# push-with-gates.sh refuses a non-conforming subject outright. Here the subject
# comes from a model and the work is already done, so refusing would throw away a
# finished iteration; normalise instead. Left alone, an invalid subject is caught
# much later by the repo's commitlint hook and surfaces as an opaque
# "git commit a échoué" escalation with no hint at the real cause.
normalize_commit_message() {  # normalize_commit_message <message> <issue>
    local msg="$1" n="$2"
    msg="${msg%%$'\n'*}"
    if ! [[ "$msg" =~ ^(feat|fix|docs|refactor|style|test|chore|ci|perf|build|revert)(\([a-zA-Z0-9_-]+\))?!?:\ .+ ]]; then
        # Keep the model's summary, strip whatever pseudo-type it invented, and
        # give it a valid one. `fix` is the honest default when the issue's own
        # type cannot be inferred from the subject.
        msg="$(sed -E 's/^[a-zA-Z]+(\([^)]*\))?!?:[[:space:]]*//' <<<"$msg")"
        [ -n "$msg" ] || msg="address issue #$n"
        msg="fix: $msg"
    fi
    # commitlint's default header limit is 100 characters; exceeding it fails the
    # hook for a reason that has nothing to do with the change.
    printf '%.100s' "$msg"
}

# create-pr's size reflex. A PR over the limit is not blocked — splitting after
# the fact means discarding a finished branch — but it is announced, in the body
# and to the reviewer, because review quality collapses past that size.
pr_size_note() {  # pr_size_note <worktree>
    local wt="$1" lines
    lines="$(git -C "$wt" diff --numstat "origin/$SHIPYARD_BASE...HEAD" 2>/dev/null \
             | awk '{ a += $1 + $2 } END { print a + 0 }')" || lines=0
    [ "${lines:-0}" -gt "$SHIPYARD_MAX_PR_DIFF_LINES" ] || return 0
    printf '\n> ⚠️ Diff de %s lignes modifiées, au-dessus du seuil de %s du skill `create-pr`.\n> Une revue au-delà de cette taille perd en fiabilité : à découper si la revue le demande.\n' \
        "$lines" "$SHIPYARD_MAX_PR_DIFF_LINES"
}

# The PR body is the reviewer's primary artefact: create-pr requires every
# acceptance criterion restated there with its test evidence. It used to be
# written once, at PR creation, and never again — so every fix round left it
# describing a diff that no longer existed, and a review asking for the body to
# be corrected asked for something no agent could deliver: three rounds burned
# on it, then escalation.
#
# The closing trailer had the mirror-image problem: `Closes #N` was hard-coded in
# both the commit and the body, and SHIPYARD_BASE is usually the repository's
# default branch — so the issue closed the moment the PR landed, including when
# only part of its acceptance criteria had shipped. An agent that writes
# `Refs #N` in the body it hands back now gets that honoured, body and commit.
pr_body_from() {  # pr_body_from <agent output> — echoes the PR-BODY block, redacted
    sed -n '/^PR-BODY-START$/,/^PR-BODY-END$/p' <<<"$1" | sed '1d;$d' | shipyard_redact
}
issue_trailer() {  # issue_trailer <issue> <pr body> — the tracker's closing trailer
    ticket_trailer "$1" "$2"
}
render_pr_body() {  # render_pr_body <issue> <worktree> <pr body> — body + trailer + size note
    local n="$1" wt="$2" body="$3"
    if [ -n "$body" ]; then
        printf '%s\n\n%s.\n' "$body" "$(issue_trailer "$n" "$body")"
    else
        printf 'Automated by shipyard loop. %s.\n' "$(issue_trailer "$n" "")"
    fi
    pr_size_note "$wt"
}
sync_pr_body() {  # sync_pr_body <issue> <pr> <worktree> <pr body> — refresh an open PR's body
    local n="$1" pr="$2" wt="$3" body="$4" f
    # An empty block means the agent handed nothing back: keep the body that is
    # already there rather than replacing it with the generic one-liner.
    [ -n "$pr" ] && [ -n "$body" ] || return 0
    f="$(mktemp)"
    render_pr_body "$n" "$wt" "$body" >"$f"
    # REST first: `gh pr edit` reads the PR through GraphQL, which fails outright
    # ("Projects (classic) is being deprecated") on repositories gh still sees a
    # classic project for — the body then never refreshed and the reviewer judged a
    # stale one on every round. `gh pr edit` stays as the fallback for other setups.
    gh api -X PATCH "repos/{owner}/{repo}/pulls/$pr" -F "body=@$f" >/dev/null 2>&1 \
        || gh pr edit "$pr" --body-file "$f" >/dev/null 2>&1 \
        || log "issue #$n — mise à jour du corps de la PR #$pr échouée (non fatal)"
    rm -f "$f"
}

# ── Merge, and what a merge means for the issue ──────────────────────────────
# Extracted from process_issue_review so the triage phase can reuse the exact same
# path: one merge implementation, one definition of "delivered". A second, slightly
# different copy is how a phase ends up merging without closing the issue, or
# closing without clearing the blocker.
pr_is_merged() {  # pr_is_merged <pr>
    [ "$(gh pr view "$1" --json state --jq .state 2>/dev/null || true)" = "MERGED" ]
}

# `gh pr merge --delete-branch` can report a non-zero exit after the server has
# already merged the PR (for example when local/remote branch cleanup races with
# branch protection). Every attempt is therefore reconciled against authoritative
# server state before being called a failure.
merge_pr() {  # merge_pr <pr> — call under .merge.lock
    local pr="$1"
    # Rebase is the default merge method, and now the expected outcome: since
    # resolve_conflicts() rebases instead of merging the base in, a branch produced
    # by this loop carries no merge commit and GitHub can always linearize it.
    # Squash survives only as a fallback for a branch that acquired a merge commit
    # some other way — an older branch, or one a human merged by hand. Reaching it
    # means the linear history was lost, so it is worth noticing rather than
    # treating as routine.
    gh pr merge "$pr" --rebase --delete-branch >/dev/null 2>&1 && return 0
    pr_is_merged "$pr" && return 0
    gh pr merge "$pr" --rebase >/dev/null 2>&1 && return 0
    pr_is_merged "$pr" && return 0
    gh pr merge "$pr" --squash --delete-branch >/dev/null 2>&1 && return 0
    pr_is_merged "$pr" && return 0
    gh pr merge "$pr" --squash >/dev/null 2>&1 && return 0
    pr_is_merged "$pr"
}

# Everything that must become true once a PR is in: board, labels, issue, per-issue
# budgets, blocker record, vault, ledger, notification. `_clear_blocker` belongs
# here — an issue that just shipped cannot still be listed as waiting on a human,
# and the triage phase merges issues that WERE blocked, so this is the only path
# that reliably retires the entry.
#
# `verified` = "criteria" means the loop's own reviewer approved this PR, and its
# prompt approves only when every acceptance criterion is satisfied by the diff and
# the tests: that verdict is what lets the vault tick them. The triage merge, which
# acts on a decision it did not review itself, leaves them alone, as do a duplicate
# closed by triage and an issue a human closed by hand.
# SHIPYARD_TICK_CRITERIA=0 restores the old contract (criteria stay in the operator's hands).
finalize_merged_issue() {  # finalize_merged_issue <issue> <pr> [from-label] [rounds] [verified]
    local n="$1" pr="$2" from="${3:-$SHIPYARD_REVIEW_LABEL}" rounds="${4:-0}" verified="${5:-}"
    ticket_finalize "$n" "$from"
    _review_state_clear "$n"
    _triage_state_clear "$n"
    _clear_blocker "$n"
    # Monotonic delivery counter. A blocked issue waiting on a dependency has exactly
    # one event that can change its verdict — something landing on the base — and this
    # is that event, observable without asking GitHub about the whole chain again.
    _state_set '.loop.merged_total = ((.loop.merged_total // 0) + 1)' || true
    if [ "$verified" = criteria ] && [ "${SHIPYARD_TICK_CRITERIA:-1}" != 0 ]; then
        SHIPYARD_VAULT_TICK_CRITERIA=1 vault_task_status "$n" done "PR #$pr"
    else
        vault_task_status "$n" done "PR #$pr"
    fi
    log "issue $(ticket_ref "$n") merged via PR #$pr ✅"
    [ -n "${RUN_LEDGER:-}" ] && printf 'merged\t%s\t%s\t%s\n' "$n" "$pr" "$rounds" >>"$RUN_LEDGER" 2>/dev/null || true
    shipyard_notify "✅ Issue $(ticket_ref "$n") mergée (PR #$pr)"
}

# Bounded fix cycle around the gates, run before the branch is ever published.
#   rc 0 — publish the branch (gates green, unavailable, or exhausted in
#          non-blocking mode where CI has the final word)
#   rc 1 — the caller must stop: the issue has been escalated
enforce_local_gates() {  # enforce_local_gates <issue> <worktree> <ctx-file> <scope>
    local n="$1" wt="$2" ctx="$3" scope="$4"
    local report rc fixes=0 fix_ctx fix_prompt fix_capture fix_out need

    while :; do
        set +e
        report="$(local_gates_report "$wt")"
        rc=$?
        set -e
        [ "$rc" -eq 1 ] || return 0

        if [ "$fixes" -ge "$SHIPYARD_MAX_GATE_FIXES" ]; then
            if [ "${SHIPYARD_LOCAL_GATES_BLOCKING}" != 0 ]; then
                log "issue #$n — gates locaux toujours rouges après $fixes correction(s) → escalade"
                git worktree remove --force "$wt" 2>/dev/null || true
                escalate "$n" "local-gates" \
                    "les gates locaux restent rouges après $fixes tentative(s) : $(head -2 <<<"$report" | tr '\n' ' ')" \
                    "rejoue le gate à la main dans .worktrees/issue-$(ticket_slug "$n") pour voir l'échec complet, corrige, puis remets le label $SHIPYARD_TODO_LABEL"
                return 1
            fi
            # Non-blocking default: publish anyway. Refusing to push here would
            # invent a brand-new way to strand work — a gate can be red for a
            # local-only reason (missing service, unset variable) that CI does
            # not have. The report still travels: the CI round starts informed.
            log "issue #$n — gates locaux toujours rouges après $fixes correction(s), on publie et on laisse la CI arbitrer"
            shipyard_notify "⚠️ Issue #$n — gates locaux rouges avant push, la CI tranchera"
            return 0
        fi

        fixes=$((fixes + 1))
        log "issue #$n — gate local rouge (correction $fixes/$SHIPYARD_MAX_GATE_FIXES)"
        fix_ctx="$(mktemp)"
        { cat "$ctx"; echo; echo "## Gate local en échec — à corriger avant publication"; echo; echo "$report"; } >"$fix_ctx"
        fix_prompt="$(render_prompt "$LOOP_DIR/prompt-dev.md" "$fix_ctx" developer "${scope:-.}")"
        fix_capture="$(mktemp)"
        if ! ( cd "$wt"; claude_invoke sonnet "$fix_prompt" | shipyard_redact >"$fix_capture" ); then
            rm -f "$fix_ctx" "$fix_capture"
            log "issue #$n — session de correction du gate en échec, on publie et on laisse la CI arbitrer"
            return 0
        fi
        fix_out="$(<"$fix_capture")"
        rm -f "$fix_ctx" "$fix_capture"

        if grep -q '^NEEDS-HUMAN:' <<<"$fix_out"; then
            need="$(grep -m1 '^NEEDS-HUMAN:' <<<"$fix_out" | sed 's/^NEEDS-HUMAN:[[:space:]]*//')"
            log "issue #$n — la correction du gate signale un blocage humain"
            git worktree remove --force "$wt" 2>/dev/null || true
            escalate "$n" "needs-human" "$need" \
                "règle le point ci-dessus (voir le commentaire), puis remets le label $SHIPYARD_TODO_LABEL"
            return 1
        fi
    done
}

# ── Build a prompt file from a template + runtime context ────────────────────
effective_rules_context() { # <agent> <scope>
    local agent="$1" scope="${2:-.}" helper
    helper="${CLAUDE_HOME:-$HOME/.claude}/shipyard/bin/engineering-rules.sh"
    [ -x "$helper" ] || return 0
    "$helper" explain --root "$REPO_ROOT" --agent "$agent" --path "${scope:-.}" 2>/dev/null || true
}

render_prompt() {  # render_prompt <template> <context-file> <agent> [scope] → path
    local tpl="$1" ctx="$2" agent="${3:-developer}" scope="${4:-.}" out sc rules
    out="$(mktemp)"
    cat "$tpl" >"$out"
    sc="$(stack_context)"
    if [ -n "$sc" ]; then
        printf '\n\n---\n%s\n' "$sc" >>"$out"
    fi
    rules="$(effective_rules_context "$agent" "$scope")"
    if [ -n "$rules" ]; then
        printf '\n\n---\n## Règles d’ingénierie effectives\n%s\n' "$rules" >>"$out"
    fi
    printf '\n\n---\n# Contexte de la tâche\n\n' >>"$out"
    cat "$ctx" >>"$out"
    echo "$out"
}

# Hard gate on CI. Returns 0 only when every check has completed and passed.
# Crucially, it WAITS for checks to register on a brand-new PR (they don't appear
# instantly) instead of treating "no checks reported yet" as a failure — that race
# otherwise burns a wasted review/fix round. Times out after ~10 min — but a
# timeout is NOT a failure: it means the checks never finished, not that one of
# them failed. rc 1 = a check actually failed; rc 2 = timed out with nothing
# reported as failed. The caller must not treat these the same way — conflating
# them used to burn a review round and a dev fix session on a PR where there was
# nothing to fix, only more waiting to do (see SHIPYARD_MAX_CI_TIMEOUT_RETRIES).
: "${SHIPYARD_CI_TIMEOUT:=600}"   # seconds
ci_is_green() {
    local pr="$1" waited=0 out rc
    while [ "$waited" -lt "$SHIPYARD_CI_TIMEOUT" ]; do
        out="$(gh pr checks "$pr" 2>&1)"; rc=$?
        if grep -qiE 'no checks reported|no checks found' <<<"$out"; then
            sleep 8; waited=$((waited + 8)); continue      # not registered yet → wait
        fi
        case "$rc" in
            0) return 0 ;;                                  # all checks passed
            8) sleep 8; waited=$((waited + 8)); continue ;; # pending → wait
            *) return 1 ;;                                  # a check failed
        esac
    done
    log "PR #$pr — CI gate timed out after ${SHIPYARD_CI_TIMEOUT}s, nothing reported as failed"
    return 2
}

# Same question, asked without waiting: used when BUILDING CONTEXT rather than
# gating on it. Blocking five minutes to decorate a prompt would be absurd, and a
# still-running check is not a failure worth reporting to the agent.
ci_is_green_now() {   # ci_is_green_now <pr>
    local pr="$1" out rc
    out="$(gh pr checks "$pr" 2>&1)"; rc=$?
    grep -qiE 'no checks reported|no checks found' <<<"$out" && return 0
    [ "$rc" -eq 0 ] || [ "$rc" -eq 8 ]   # 8 = still pending, not a failure
}

# "La CI n'est pas verte" is a verdict, not a briefing. The fix session that
# received it had no job name and no log line, so it re-guessed the fix from the
# issue text alone — and burned the review budget doing it. Hand it what a human
# would open instead: which checks failed, and the tail of their failed steps.
#
# `gh pr checks --json` yields the job URL; its trailing /job/<id> is exactly what
# `gh run view --job` consumes. Bounded per job AND in total, because this text is
# re-injected into a prompt.
: "${SHIPYARD_CI_LOG_LINES:=40}"      # tail of the failed steps, per failing job
: "${SHIPYARD_CI_REPORT_MAX_CHARS:=6000}"
ci_failure_report() {   # ci_failure_report <pr> → actionable markdown on stdout
    local pr="$1" rows name link job logs out=""
    rows="$(gh pr checks "$pr" --json name,state,link --jq '
        .[] | select(.state == "FAILURE" or .state == "TIMED_OUT"
                     or .state == "CANCELLED" or .state == "ACTION_REQUIRED")
            | "\(.name)\t\(.state)\t\(.link)"' 2>/dev/null)" || rows=""

    if [ -z "$rows" ]; then
        # Nothing reported as failed: the gate fell through on a timeout, i.e. the
        # checks never completed. Say that — it is a different problem from a
        # failing test, and telling the agent to "fix the tests" would be a lie.
        printf '%s\n' "La CI ne s'est pas stabilisée dans le temps imparti (${SHIPYARD_CI_TIMEOUT}s) : aucun check n'est en échec, mais tous ne sont pas terminés. Relis \`gh pr checks $pr\`. Ne modifie pas le code au hasard : si les checks sont seulement lents, il n'y a rien à corriger."
        return 0
    fi

    out="La CI n'est pas verte sur la PR #$pr. Voici les checks en échec et l'extrait de leurs étapes échouées — corrige la cause réelle, ne désactive ni le check ni le test.

"
    while IFS=$'\t' read -r name state link; do
        [ -n "$name" ] || continue
        out+="### Check en échec : \`$name\` ($state)
$link

"
        job="${link##*/job/}"; job="${job%%\?*}"
        if [[ "$job" =~ ^[0-9]+$ ]]; then
            # Raw --log-failed prefixes EVERY line with "job\tstep\tISO-timestamp"
            # and interleaves workflow bookkeeping. Left alone, that boilerplate
            # eats most of the tail window and the actual error scrolls out of it.
            # Strip the prefix and the group markers — but never ##[error].
            # `|| logs=""` is load-bearing under `set -e -o pipefail`: this whole
            # function runs with -e active (it is called from a plain assignment),
            # and `grep -v` exits 1 when it filters everything out — which would
            # kill the loop instead of reporting "logs unavailable".
            logs="$(gh run view --job "$job" --log-failed 2>/dev/null \
                    | sed -e 's/\x1b\[[0-9;]*m//g' \
                          -e 's/^[^\t]*\t[^\t]*\t[0-9-]*T[0-9:.]*Z //' \
                    | grep -vE '^##\[(group|endgroup|start-action|end-action)' \
                    | tail -n "$SHIPYARD_CI_LOG_LINES")" || logs=""
            if [ -n "$logs" ]; then
                out+='```
'"$logs"'
```

'
            else
                out+="(logs indisponibles — ouvre le lien ci-dessus)

"
            fi
        fi
    done <<<"$rows"

    out="$(printf '%s' "$out" | shipyard_redact)" || out="(rapport CI illisible)"
    if [ "${#out}" -gt "$SHIPYARD_CI_REPORT_MAX_CHARS" ]; then
        out="${out:0:$SHIPYARD_CI_REPORT_MAX_CHARS}
… (rapport CI tronqué à $SHIPYARD_CI_REPORT_MAX_CHARS caractères)"
    fi
    printf '%s\n' "$out"
}

# GitHub computes mergeability asynchronously: right after a push the field reads
# UNKNOWN, so a single query would take "not computed yet" for "no conflict".
# Called only after a merge attempt already failed, never on the happy path.
: "${SHIPYARD_MERGEABLE_TRIES:=5}"
pr_conflicting() {  # pr_conflicting <pr> → 0 when the PR conflicts with its base
    local pr="$1" i=0 state
    while [ "$i" -lt "$SHIPYARD_MERGEABLE_TRIES" ]; do
        i=$((i + 1))
        state="$(gh pr view "$pr" --json mergeable --jq '.mergeable' 2>/dev/null || echo UNKNOWN)"
        case "$state" in
            CONFLICTING) return 0 ;;
            MERGEABLE)   return 1 ;;
        esac
        [ "$i" -lt "$SHIPYARD_MERGEABLE_TRIES" ] && sleep 3   # no trailing wait
    done
    return 1   # never computed — treat as "not a conflict we can act on"
}

: "${SHIPYARD_REBASE_MAX_STEPS:=30}"

# True while a rebase is stopped mid-flight, whatever backend git picked.
_rebase_in_progress() {  # _rebase_in_progress <worktree>
    ( cd "$1" 2>/dev/null || exit 1
      [ -d "$(git rev-parse --git-path rebase-merge 2>/dev/null)" ] ||
      [ -d "$(git rev-parse --git-path rebase-apply 2>/dev/null)" ] )
}

# A branch whose base moved during review conflicts at merge time. Rebase the
# branch ONTO the base rather than merging the base into it: the branch keeps a
# linear history, so GitHub's "rebase and merge" can linearize it and the base
# never receives a merge commit. Merging the base in was the previous strategy —
# it cost every PR its rebase merge and silently forced the squash fallback, which
# is precisely what we no longer want.
#
# The push must then be forced, since rebasing rewrites the branch's commits:
# `--force-with-lease`, never `--force`. It refuses when the remote moved since our
# last fetch, so a concurrent push is never silently overwritten — and it is the
# unconditional form alone that the deny rules forbid.
#
# Rebasing replays commits one at a time, so conflicts arrive ONE COMMIT AT A TIME
# rather than all at once — the loop below resolves each stop and continues, bounded
# by SHIPYARD_REBASE_MAX_STEPS. `git rerere` (turned on by main(), and shared by
# every worktree since they read the same .git/config) replays a resolution already
# given for an identical conflict: that is what keeps the per-commit cost bearable,
# since the same hunk is not handed back to the agent on each replayed commit.
#
# GIT_EDITOR=true on every rebase step: `--continue` opens the commit-message editor
# as soon as a resolution is staged, and an editor waiting for input in a
# non-interactive run hangs the loop rather than failing it.
#
# Deliberately NOT subject to package_diff_violations: integrating the base
# legitimately touches files outside this issue's package scope.
resolve_conflicts() {  # resolve_conflicts <issue> <tag> <worktree> <branch> <ctx> <scope>
    local n="$1" tag="$2" wt="$3" branch="$4" ctx="$5" scope="${6:-.}"
    log "$tag — conflit avec $SHIPYARD_BASE, tentative de résolution par rebase"
    git -C "$wt" fetch -q origin "$SHIPYARD_BASE" 2>/dev/null || return 1

    # A rebase left over from an earlier interrupted run would make every command
    # below operate on someone else's half-finished state.
    _rebase_in_progress "$wt" && { git -C "$wt" rebase --abort 2>/dev/null || true; }

    # The branch may replay cleanly: GitHub reported a conflict against an older tip.
    if GIT_EDITOR=true git -C "$wt" rebase "origin/$SHIPYARD_BASE" >/dev/null 2>&1; then
        git -C "$wt" push -q --force-with-lease origin "$branch" 2>/dev/null || return 1
        log "$tag — base intégrée sans conflit réel"
        return 0
    fi

    local step=0 files f cf_ctx cf_prompt cf_capture
    while _rebase_in_progress "$wt"; do
        step=$((step + 1))
        if [ "$step" -gt "$SHIPYARD_REBASE_MAX_STEPS" ]; then
            log "$tag — rebase toujours en cours après $SHIPYARD_REBASE_MAX_STEPS étapes, abandon"
            git -C "$wt" rebase --abort 2>/dev/null || true
            return 1
        fi

        files="$(git -C "$wt" diff --name-only --diff-filter=U 2>/dev/null)"

        # No unmerged path at a stop means there is nothing to ask an agent: either
        # rerere already staged the whole resolution, or the commit became empty
        # because the base now carries its change. `--continue` covers the first,
        # `--skip` the second.
        if [ -z "$files" ]; then
            if git -C "$wt" diff --cached --quiet 2>/dev/null; then
                log "$tag — étape $step vide (déjà sur $SHIPYARD_BASE), commit ignoré"
                GIT_EDITOR=true git -C "$wt" rebase --skip >/dev/null 2>&1 || true
            else
                log "$tag — étape $step résolue automatiquement (rerere)"
                GIT_EDITOR=true git -C "$wt" rebase --continue >/dev/null 2>&1 || true
            fi
            continue
        fi

        log "$tag — étape $step, fichiers en conflit : $(tr '\n' ' ' <<<"$files")"

        cf_ctx="$(mktemp)"
        { cat "$ctx"
          printf '\n## Conflit de rebase à résoudre\n\n'
          printf 'Un `git rebase` de la branche `%s` sur `origin/%s` est EN COURS dans ce worktree, et il est arrêté sur UN commit (étape %s).\n\n' \
              "$branch" "$SHIPYARD_BASE" "$step"
          printf 'Fichiers en conflit :\n\n```\n%s\n```\n\n' "$files"
          printf 'Résous chaque conflit en gardant les DEUX intentions : celle arrivée sur `%s` et celle de cette issue. Ne supprime jamais le travail venu de la base pour faire passer le tien. Ne laisse aucun marqueur de conflit.\n\n' \
              "$SHIPYARD_BASE"
          printf 'ATTENTION — pendant un rebase, `ours` et `theirs` sont INVERSÉS par rapport à un merge : `ours` désigne `%s` (la base sur laquelle on rejoue), `theirs` le commit de cette issue en cours de rejeu. Ne te fie pas à ces noms, lis le contenu.\n\n' \
              "$SHIPYARD_BASE"
          printf 'Ne commite pas, ne pousse pas, et ne lance jamais `git rebase --continue`, `--skip` ni `--abort` : la boucle enchaîne les étapes elle-même. Laisse simplement les fichiers résolus sur le disque — `git add` est permis mais inutile, la boucle stage pour toi.\n'
          printf '\nTraite les fichiers toi-même, l'"'"'un après l'"'"'autre. N'"'"'ouvre pas de sous-agent : tu connais déjà le contexte, un sous-agent le redécouvrirait depuis zéro pendant que tu attends — l'"'"'outil est de toute façon retiré pour cet appel.\n'
        } >"$cf_ctx"
        cf_prompt="$(render_prompt "$LOOP_DIR/prompt-dev.md" "$cf_ctx" developer "$scope")"
        cf_capture="$(mktemp)"
        # Agent/Task withheld at the CLI, not just discouraged above: delegating this
        # step nests a second full reasoning loop that re-reads the whole worktree
        # while the parent blocks — measured at ~30 min and 149 shell calls for a
        # 13-file merge one session resolves directly in a fraction of that.
        if ! ( cd "$wt"; SHIPYARD_DISALLOWED_TOOLS="Agent Task" \
                 claude_invoke sonnet "$cf_prompt" | shipyard_redact >"$cf_capture" ); then
            rm -f "$cf_capture" "$cf_ctx"
            git -C "$wt" rebase --abort 2>/dev/null || true
            return 1
        fi
        rm -f "$cf_capture" "$cf_ctx"

        # Trust the result only after checking it: a leftover marker would otherwise
        # be staged and replayed as valid code. Scanning the WORKING TREE is what
        # makes this check meaningful — the index still reports every path as
        # unmerged until something stages it, so `--diff-filter=U` here would reject
        # a correctly resolved file merely because the agent did not `git add` it.
        # A file left untouched still carries its markers, so this one test covers
        # both "not resolved" and "half resolved".
        while IFS= read -r f; do
            [ -n "$f" ] && [ -f "$wt/$f" ] || continue
            if grep -qE '^(<<<<<<< |=======$|>>>>>>> )' "$wt/$f" 2>/dev/null; then
                log "$tag — marqueurs de conflit laissés dans $f à l'étape $step"
                git -C "$wt" rebase --abort 2>/dev/null || true
                return 1
            fi
        done <<<"$files"

        # `--continue` exits non-zero when it merely stops at the NEXT conflicting
        # commit, which is the normal path here, not a failure: the loop condition
        # decides whether the rebase is finished, and the step ceiling bounds the
        # case where it genuinely cannot advance.
        ( cd "$wt"; git add -A ) || { git -C "$wt" rebase --abort 2>/dev/null || true; return 1; }
        GIT_EDITOR=true git -C "$wt" rebase --continue >/dev/null 2>&1 || true
    done

    # Forced because the replay rewrote every commit — leased so a push that landed
    # on the branch since our fetch aborts this one instead of being erased.
    git -C "$wt" push -q --force-with-lease origin "$branch" || {
        log "$tag — rebase fait mais push refusé (la branche a bougé à distance)"
        return 1
    }
    log "$tag — conflits résolus et rejoués, poussés ; historique linéaire, la CI revalide"
    return 0
}

# An issue retried after an escalation resumes from its existing feat/<n> branch,
# frozen at the commit it was abandoned on. Anything fixed on the base since then
# — engineering standards, CI workflows, and above all .claude/settings.json,
# which decides what the agent is even allowed to run — never reaches that
# worktree, so the retry reproduces the failure that caused the escalation.
# Integrate the base up front rather than discovering the drift at merge time.
#
# The ancestry test doubles as the "was this worktree resumed?" check: a worktree
# just created off origin/<base> has it as HEAD, so this is a no-op there. No flag
# is threaded out of _setup_worktree, which runs in a flock subshell.
sync_base() {   # sync_base <issue> <worktree> <branch> <ctx> <scope>
    local n="$1" wt="$2" branch="$3" ctx="$4" scope="${5:-.}"
    git -C "$wt" merge-base --is-ancestor "origin/$SHIPYARD_BASE" HEAD 2>/dev/null && return 0
    log "issue #$n — $branch est en retard sur $SHIPYARD_BASE, intégration de la base"
    if resolve_conflicts "$n" "issue #$n" "$wt" "$branch" "$ctx" "$scope"; then
        return 0
    fi
    # Non-fatal: the dev session still runs, and a conflict left standing is
    # caught again by the merge gate, which escalates with the PR in hand.
    log "issue #$n — intégration de $SHIPYARD_BASE impossible, poursuite sur la branche en l'état"
    return 0
}

# ── Documentation passes ─────────────────────────────────────────────────────
# Documentation is part of delivery, not a phase after it. Per ticket it runs
# INSIDE the worktree before the commit, so it lands in the same PR as the code
# and gets reviewed with it. The scope decision is deterministic and belongs to
# doc-impact-score.sh (tier 0 = no-op), never to the agent's mood.
# Knobs: SHIPYARD_DOCS=0 disables everything, SHIPYARD_DOCS_SPRINT=0 keeps only
# the per-ticket pass, SHIPYARD_DOC_MODEL selects the model (default sonnet).
: "${SHIPYARD_DOCS:=1}"
: "${SHIPYARD_DOCS_SPRINT:=1}"
doc_core() { printf '%s' "${CLAUDE_HOME:-$HOME/.claude}/shipyard/bin"; }

doc_pass() {   # doc_pass <worktree> <issue-number> <package-scope>
    local wt="$1" n="$2" scope="${3:-.}" core impact tier label ctx prompt out
    [ "${SHIPYARD_DOCS:-1}" != 0 ] || return 0
    core="$(doc_core)"
    [ -x "$core/doc-impact-score.sh" ] || { log "documentation engine not installed — skipping"; return 0; }

    impact="$(SHIPYARD_PROJECT_ROOT="$wt" "$core/doc-impact-score.sh" --working 2>/dev/null)" || return 0
    tier="$(jq -r '.tier // 0' <<<"$impact" 2>/dev/null || echo 0)"
    if ! [ "${tier:-0}" -gt 0 ] 2>/dev/null; then
        log "issue #$n — documentation tier 0, nothing to write"
        return 0
    fi
    label="$(jq -r '.tier_label // "technical"' <<<"$impact" 2>/dev/null || echo technical)"
    log "issue #$n — documentation pass (tier $tier/$label)"

    ( cd "$wt" && "$core/init-doc-baseline.sh" . ) >/dev/null 2>&1 || true

    ctx="$(mktemp)"
    { echo "## Issue $(ticket_ref "$n")"
      ticket_title_body "$n" || echo '(issue indisponible)'
      echo; echo "## Impact documentaire calculé (autorité)"
      echo '```json'; printf '%s\n' "$impact"; echo '```'
      echo; echo "## Cible documentaire"
      echo '```json'; ( cd "$wt" && "$core/detect-docs-target.sh" . ) 2>/dev/null || echo '{}'; echo '```'
      echo; echo "## Fichiers modifiés (non commités)"
      ( cd "$wt" && git status --porcelain=v1 ) 2>/dev/null | head -100
    } >"$ctx"

    prompt="$(render_prompt "$LOOP_DIR/prompt-doc.md" "$ctx" doc-writer "$scope")"
    out="$( cd "$wt" && claude_invoke "${SHIPYARD_DOC_MODEL:-sonnet}" "$prompt" 2>/dev/null | shipyard_redact )" || true
    rm -f "$ctx" "$prompt"
    if printf '%s' "$out" | grep -q '^DOCS:'; then
        log "issue #$n — $(printf '%s' "$out" | grep -m1 '^DOCS:')"
    else
        log "issue #$n — documentation pass produced no verdict line (non-fatal)"
    fi
    return 0
}

# End-of-sprint consolidation: the per-ticket passes keep documents true, this one
# keeps the WHOLE suite coherent (cross-cutting diagrams, onboarding, period report,
# version bump) over everything merged since the last consolidation. Runs on its own
# branch and opens a documentation-only PR.
doc_sprint_pass() {
    local core range last base_ref branch wt impact tier ctx prompt out sprint_no
    [ "${SHIPYARD_DOCS:-1}" != 0 ] || return 0
    [ "${SHIPYARD_DOCS_SPRINT:-1}" != 0 ] || return 0
    core="$(doc_core)"
    [ -x "$core/doc-impact-score.sh" ] || return 0

    git -C "$REPO_ROOT" fetch -q origin "$SHIPYARD_BASE" 2>/dev/null || true
    base_ref="origin/$SHIPYARD_BASE"
    git -C "$REPO_ROOT" rev-parse --verify "$base_ref" >/dev/null 2>&1 || base_ref='HEAD'
    last="$(jq -r '.documentation.last_documented_commit // ""' "$STATE" 2>/dev/null)"
    if [ -z "$last" ] || ! git -C "$REPO_ROOT" cat-file -e "$last^{commit}" 2>/dev/null; then
        last="$(git -C "$REPO_ROOT" rev-list --max-parents=0 "$base_ref" 2>/dev/null | tail -1)"
    fi
    [ -n "$last" ] || return 0
    range="$last..$base_ref"

    impact="$(SHIPYARD_PROJECT_ROOT="$REPO_ROOT" "$core/doc-impact-score.sh" --range "$range" 2>/dev/null)" || return 0
    tier="$(jq -r '.tier // 0' <<<"$impact" 2>/dev/null || echo 0)"
    if ! [ "${tier:-0}" -gt 0 ] 2>/dev/null; then
        log "sprint documentation: nothing to consolidate over $range"
        return 0
    fi

    sprint_no="$(jq -r '.current_sprint // 1' "$STATE" 2>/dev/null || echo 1)"
    branch="docs/sprint-$(printf '%03d' "$sprint_no" 2>/dev/null || echo "$sprint_no")"
    wt="$REPO_ROOT/.worktrees/docs-sprint-$(printf '%03d' "$sprint_no" 2>/dev/null || echo "$sprint_no")"
    log "sprint documentation consolidation over $range → $branch"

    # Like the dev and review phases, this one writes in its OWN worktree. The
    # main tree then never leaves $SHIPYARD_BASE: a human can keep working in the
    # repository while the documentation consolidates, and no `git add -A` here
    # can sweep up whatever the main tree happened to have uncommitted. Checking
    # the branch out in the main tree was the previous strategy — one failed push
    # parked that tree off-base for 19+ hours across dozens of runs (2026-08-09),
    # none of which noticed, because every later run inherited the wrong branch.
    _setup_docs_worktree() {
        # Self-heal: an older revision of this function checked $branch out in
        # the main tree, and git refuses to check the same branch out twice.
        if [ "$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null)" = "$branch" ]; then
            git -C "$REPO_ROOT" checkout -q "$SHIPYARD_BASE" 2>/dev/null || true
        fi
        rm -rf "$wt"
        git -C "$REPO_ROOT" worktree remove --force "$wt" 2>/dev/null || true
        git -C "$REPO_ROOT" worktree add -B "$branch" "$wt" "$base_ref" >/dev/null 2>&1 \
            || git -C "$REPO_ROOT" worktree add -B "$branch" "$wt" >/dev/null
    }
    _drop_docs_worktree() {
        git -C "$REPO_ROOT" worktree remove --force "$wt" 2>/dev/null || true
        rm -rf "$wt"
    }
    _with_lock "$REPO_ROOT/.project/.git.lock" _setup_docs_worktree
    [ -d "$wt" ] || { log "could not create the $branch worktree (non-fatal)"; return 0; }

    ( cd "$wt" && "$core/init-doc-baseline.sh" . ) >/dev/null 2>&1 || true

    ctx="$(mktemp)"
    { echo "## Passe de consolidation — sprint $sprint_no"
      echo "Plage documentée : \`$range\`"
      echo; echo "## Impact documentaire calculé (autorité)"
      echo '```json'; printf '%s\n' "$impact"; echo '```'
      echo; echo "## Cible documentaire"
      echo '```json'; ( cd "$wt" && "$core/detect-docs-target.sh" . ) 2>/dev/null || echo '{}'; echo '```'
      echo; echo "## Commits du sprint"
      git -C "$REPO_ROOT" log --format='- %h %s' "$range" 2>/dev/null | head -100
    } >"$ctx"

    prompt="$(render_prompt "$LOOP_DIR/prompt-doc.md" "$ctx" doc-writer '.')"
    out="$( cd "$wt" && claude_invoke "${SHIPYARD_DOC_MODEL:-sonnet}" "$prompt" 2>/dev/null | shipyard_redact )" || true
    rm -f "$ctx" "$prompt"

    if ( cd "$wt" && git add -A && ! git diff --cached --quiet ); then
        ( cd "$wt" &&
          git commit -q -m "docs(sprint-$sprint_no): consolidate technical and functional documentation" &&
          git push -q -u origin "$branch" --force-with-lease ) 2>/dev/null || {
            # The commit survives on $branch even when the push fails: the next
            # run recreates the worktree from $base_ref and redoes the pass.
            log "documentation push failed (non-fatal)"
            _with_lock "$REPO_ROOT/.project/.git.lock" _drop_docs_worktree
            return 0
        }
        gh pr create --base "$SHIPYARD_BASE" --head "$branch" \
            --title "docs(sprint-$sprint_no): consolidate documentation" \
            --body "Documentation consolidation for sprint $sprint_no over \`$range\`. Generated by the shipyard documentation pass." \
            >/dev/null 2>&1 || log "documentation PR already open or could not be created"
        _state_set ".documentation.last_documented_commit=\"$(git -C "$REPO_ROOT" rev-parse "$base_ref")\" | .documentation.last_pass=\"$(date -u +%FT%TZ)\""
        shipyard_notify "📚 Documentation du sprint $sprint_no prête à relire"
    else
        log "sprint documentation: the pass changed nothing"
    fi
    _with_lock "$REPO_ROOT/.project/.git.lock" _drop_docs_worktree
    return 0
}

# ─────────────────────────────────────────────────────────────────────────────
# Issue context (goal + acceptance criteria live in the issue body), shared by
# the dev and review phases. Each rebuilds it fresh — they may run in different
# process_issue_dev()/process_issue_review() calls, possibly different systemd
# invocations, so nothing about the context can be assumed to still be in memory.
# ─────────────────────────────────────────────────────────────────────────────
build_issue_context() {  # build_issue_context <issue> <branch> <package_scope> -> path
    local n="$1" branch="$2" scope="$3" ctx; ctx="$(mktemp)"
    ticket_context "$n" >"$ctx" 2>/dev/null || echo "Issue $(ticket_ref "$n")" >"$ctx"
    human_replies "$n" >>"$ctx"
    pr_feedback "$n" "$branch" >>"$ctx"
    package_scope_context "$scope" >>"$ctx"
    printf '%s' "$ctx"
}

# ─────────────────────────────────────────────────────────────────────────────
# DEV phase: claim → worktree → dev session → local gates → commit/push → open
# (or reuse) the PR → hand off to REVIEW by moving the label. Returns as soon as
# the PR exists — it never waits on CI or a review verdict, so one slow PR can't
# stall the next issue. Returns 0 once the PR is open (or reused), 1 on
# escalation/failure. The worktree is always gone on return, success or not:
# the review phase rebuilds its own from the pushed branch regardless.
# ─────────────────────────────────────────────────────────────────────────────
process_issue_dev() {
    local n="$1"
    local branch="feat/$(ticket_slug "$n")"
    local wt="$REPO_ROOT/.worktrees/issue-$(ticket_slug "$n")"

    set_current_issue "$n"
    local attempt; attempt="$(bump_attempt "$n")"
    if [ "$attempt" -gt "$MAX_ATTEMPTS" ]; then
        log "issue #$n exceeded max attempts ($MAX_ATTEMPTS) → escalate"
        escalate "$n" "max-attempts" \
            "l'issue a été retentée $MAX_ATTEMPTS fois sans aboutir" \
            "inspecte l'issue et la dernière PR ; précise ou scinde la spec, puis remets le label $SHIPYARD_TODO_LABEL"
        return 1
    fi

    log "issue #$n — attempt $attempt/$MAX_ATTEMPTS"
    # Claiming an issue means whatever blocked it before was dealt with: drop the
    # stale entry now. If this run blocks again, escalate() records the new cause.
    _clear_blocker "$n"
    ticket_set_status "$n" "$SHIPYARD_TODO_LABEL" "$SHIPYARD_WIP_LABEL"
    vault_task_status "$n" in-progress "tentative $attempt/$MAX_ATTEMPTS"

    local package_scope="" scope_rc=0
    package_scope="$(package_scope_for_issue "$n")" || scope_rc=$?
    if [ "$scope_rc" -ne 0 ]; then
        if [ "$scope_rc" -eq 2 ]; then
            escalate "$n" "package-scope" \
                "plusieurs labels pkg:* rendent le périmètre monorepo ambigu" \
                "conserve exactement un label pkg:* sur l'issue puis remets le label $SHIPYARD_TODO_LABEL"
        else
            escalate "$n" "package-scope" \
                "le label pkg:* ne correspond à aucun package configuré" \
                "ajoute ce package dans .stack_profile.packages ou corrige le label, puis remets $SHIPYARD_TODO_LABEL"
        fi
        return 1
    fi
    [ -n "$package_scope" ] && log "issue #$n — monorepo scope: $package_scope"

    # Fresh worktree off the latest base branch. Serialized: concurrent workers
    # touching the shared .git (worktree registry + ref creation) can race.
    _setup_worktree() {
        local start_ref="origin/$SHIPYARD_BASE"
        git fetch --quiet origin "$SHIPYARD_BASE" || true
        # A previous run may have died after pushing feat/<issue> but before it
        # could open or merge the PR. Resume from that remote branch so already
        # committed work is preserved instead of resetting it to develop.
        if git fetch --quiet origin "$branch:refs/remotes/origin/$branch" 2>/dev/null; then
            start_ref="origin/$branch"
        fi
        rm -rf "$wt"
        git worktree remove --force "$wt" 2>/dev/null || true
        git worktree add -B "$branch" "$wt" "$start_ref" >/dev/null 2>&1 \
            || git worktree add -B "$branch" "$wt" >/dev/null
    }
    _with_lock "$REPO_ROOT/.project/.git.lock" _setup_worktree

    local ctx; ctx="$(build_issue_context "$n" "$branch" "$package_scope")"

    # After $ctx exists: resolving a conflict needs the issue context, and the
    # base must land before the dev session reads the worktree's configuration.
    sync_base "$n" "$wt" "$branch" "$ctx" "${package_scope:-.}"

    # ── DEV step (Sonnet, fresh context) ─────────────────────────────────────
    local dev_prompt dev_out commit_msg dev_capture pr_body
    dev_prompt="$(render_prompt "$LOOP_DIR/prompt-dev.md" "$ctx" developer "${package_scope:-.}")"
    dev_capture="$(mktemp)"
    if ! (
        cd "$wt"
        claude_invoke sonnet "$dev_prompt" | shipyard_redact >"$dev_capture"
    ); then
        rm -f "$dev_capture"
        log "dev session failed for #$n"
        if [ "$attempt" -ge "$MAX_ATTEMPTS" ]; then
            git worktree remove --force "$wt" 2>/dev/null || true
            escalate "$n" "max-attempts" \
                "la session de développement a échoué $attempt fois" \
                "inspecte les logs et l'issue, corrige la cause, puis remets le label $SHIPYARD_TODO_LABEL"
        fi
        return 1
    fi
    dev_out="$(<"$dev_capture")"
    rm -f "$dev_capture"

    # The agent can raise a non-code blocker it cannot resolve itself (a missing
    # secret/token, a permission, an external service): it emits NEEDS-HUMAN: … .
    # We escalate with that message instead of committing empty work.
    if grep -q '^NEEDS-HUMAN:' <<<"$dev_out"; then
        local need; need="$(grep -m1 '^NEEDS-HUMAN:' <<<"$dev_out" | sed 's/^NEEDS-HUMAN:[[:space:]]*//')"
        log "issue #$n — dev signaled a human-blocking dependency"
        git worktree remove --force "$wt" 2>/dev/null || true
        escalate "$n" "needs-human" "$need" \
            "règle le point ci-dessus (voir le commentaire), puis remets le label $SHIPYARD_TODO_LABEL"
        return 1
    fi

    commit_msg="$(grep -m1 '^COMMIT:' <<<"$dev_out" | sed 's/^COMMIT:[[:space:]]*//')"
    [ -z "$commit_msg" ] && commit_msg="feat: address issue #$n"
    commit_msg="$(printf '%s' "$commit_msg" | shipyard_redact)"
    local raw_commit_msg="$commit_msg"
    commit_msg="$(normalize_commit_message "$commit_msg" "$n")"
    [ "$commit_msg" = "$raw_commit_msg" ] \
        || log "issue #$n — message de commit normalisé (Conventional Commits) : \"$commit_msg\""

    # The dev agent should also hand back a PR body (see create-pr skill: link to
    # the task, acceptance criteria, test evidence) instead of leaving it to a
    # generic one-liner. Absent or malformed block → fall back below.
    pr_body="$(pr_body_from "$dev_out")"
    local close_trailer; close_trailer="$(issue_trailer "$n" "$pr_body")"

    # Documentation pass BEFORE the commit: it must ship in this PR, reviewed with
    # the code it describes. Never fatal — a delivery is not held hostage by docs.
    doc_pass "$wt" "$n" "${package_scope:-.}" || log "documentation pass failed for #$n (non-fatal)"

    # Local gates BEFORE the commit, on the final tree — docs included, since a
    # generated doc file can itself break lint. This is the push-to-github skill
    # enforced by the orchestrator rather than trusted to the agent.
    enforce_local_gates "$n" "$wt" "$ctx" "${package_scope:-.}" || return 1

    # Orchestrator owns git (deterministic). Capture output so a push/auth failure
    # is classified into an actionable blocker, distinct from "nothing produced".
    local gitout scope_violations
    gitout="$( cd "$wt" && {
        git add -A
        if git diff --cached --quiet; then echo '__NOCHANGES__'; exit 42; fi
        scope_violations="$(package_diff_violations "$wt" "$package_scope")"
        if [ -n "$scope_violations" ]; then
            printf '__SCOPE_VIOLATION__\n%s\n' "$scope_violations"; exit 43
        fi
        # Le statut du groupe { } est celui de la DERNIÈRE commande. Sans ce
        # garde-fou, un `git commit` en échec (hook husky, commitlint, index
        # verrouillé…) était suivi d'un `git push` qui réussissait en ne
        # poussant rien : la branche restait identique à la base, et l'échec
        # ressortait plus loin en "could not open PR" — cause introuvable.
        git commit -q -m "$commit_msg" -m "$close_trailer" \
            || { echo '__COMMITFAILED__'; exit 44; }
        git push -q -u origin "$branch" --force-with-lease
      } 2>&1 )" || {
        if grep -q '__NOCHANGES__' <<<"$gitout"; then
            # An empty diff is not always an idle agent. When the branch already
            # carries commits ahead of the base and an open PR, the work is DONE and
            # simply pushed — a dev pass over it can only ever produce nothing. That
            # was #138/PR #149: escalate "no-output" → human sets todo → dev phase →
            # empty diff → escalate, forever, while the PR rotted into conflict. Hand
            # it to the review phase, which is what actually finishes the job.
            local done_pr done_commits
            done_pr="$(gh pr list --head "$branch" --state open --json number --jq '.[0].number // empty' 2>/dev/null)"
            done_commits=0
            [ -n "$done_pr" ] && done_commits="$(gh pr view "$done_pr" --json commits --jq '.commits | length' 2>/dev/null || echo 0)"
            if [ "${done_commits:-0}" -gt 0 ]; then
                log "no new changes for #$n but PR #$done_pr carries $done_commits commit(s) → hand over to review"
                git worktree remove --force "$wt" 2>/dev/null || true
                ticket_set_status "$n" "$SHIPYARD_WIP_LABEL" "$SHIPYARD_REVIEW_LABEL"
                vault_task_status "$n" in-review "PR #$done_pr"
                return 0
            fi
            log "no changes produced for #$n → escalate"
            git worktree remove --force "$wt" 2>/dev/null || true
            escalate "$n" "no-output" \
                "l'agent n'a produit aucun changement de fichier" \
                "inspecte l'issue (spec trop vague ?) puis remets le label $SHIPYARD_TODO_LABEL"
        elif grep -q '__COMMITFAILED__' <<<"$gitout"; then
            log "git commit failed for #$n → escalate"
            git worktree remove --force "$wt" 2>/dev/null || true
            escalate "$n" "commit-failed" \
                "git commit a échoué malgré des changements stagés : $(grep -v '__COMMITFAILED__' <<<"$gitout" | tail -3 | tr '\n' ' ')" \
                "rejoue le commit à la main dans .worktrees/issue-$(ticket_slug "$n") pour voir l'erreur (hook husky ? commitlint ?), corrige, puis remets le label $SHIPYARD_TODO_LABEL"
        elif grep -q '__SCOPE_VIOLATION__' <<<"$gitout"; then
            scope_violations="$(sed -n '/__SCOPE_VIOLATION__/,$p' <<<"$gitout" | tail -n +2)"
            log "out-of-scope monorepo changes for #$n → escalate"
            git worktree remove --force "$wt" 2>/dev/null || true
            escalate "$n" "package-scope" \
                "des fichiers hors de $package_scope ont été modifiés: $(tr '\n' ' ' <<<"$scope_violations")" \
                "restreins le changement à $package_scope puis remets le label $SHIPYARD_TODO_LABEL"
        else
            log "commit/push failed for #$n → escalate"
            local cb reason rem; cb="$(classify_blocker "$gitout")"
            reason="${cb%%$'\x1f'*}"; rem="${cb#*$'\x1f'}"
            escalate "$n" "push-failed" "$reason" "$rem"
        fi
        return 1; }

    # ── Open (or refresh) the PR against the integration branch ──────────────
    # A reused PR gets its body rewritten from this round's output: the diff has
    # changed, so a body frozen on the first round is stale by construction.
    local pr
    pr="$(gh pr list --head "$branch" --json number --jq '.[0].number // empty' 2>/dev/null)"
    local prout=""
    if [ -z "$pr" ]; then
        local body_file; body_file="$(mktemp)"
        render_pr_body "$n" "$wt" "$pr_body" >"$body_file"
        prout="$(gh pr create --base "$SHIPYARD_BASE" --head "$branch" \
            --title "$commit_msg" --body-file "$body_file" 2>&1)" || true
        rm -f "$body_file"
        pr="$(gh pr list --head "$branch" --json number --jq '.[0].number // empty' 2>/dev/null)"
    else
        sync_pr_body "$n" "$pr" "$wt" "$pr_body"
    fi
    if [ -z "$pr" ]; then
        log "could not open PR for #$n → escalate"
        git worktree remove --force "$wt" 2>/dev/null || true
        local cb reason rem; cb="$(classify_blocker "$prout")"
        reason="${cb%%$'\x1f'*}"; rem="${cb#*$'\x1f'}"
        escalate "$n" "pr-failed" "$reason" "$rem"
        return 1
    fi
    ticket_set_status "$n" "$SHIPYARD_WIP_LABEL" "$SHIPYARD_REVIEW_LABEL"
    vault_task_status "$n" in-review "PR #$pr"
    shipyard_notify "📤 PR #$pr ouverte pour l'issue #$n"
    git worktree remove --force "$wt" 2>/dev/null || true
    return 0
}

# ─────────────────────────────────────────────────────────────────────────────
# REVIEW phase: rebuild the worktree from the branch the dev phase already
# pushed, resume any persisted round/conflict-fix budget, and run the hard-gate
# (CI) + agent-judgement loop to either merge or bounce back to a fix session.
# Never runs a dev session — a status:in-review issue is never re-developed
# from scratch, only re-judged and, if genuinely wrong, fixed in place.
# Returns 0 on merge, 1 on escalation/failure.
# ─────────────────────────────────────────────────────────────────────────────
process_issue_review() {
    local n="$1"
    local branch="feat/$(ticket_slug "$n")"
    local wt="$REPO_ROOT/.worktrees/issue-$(ticket_slug "$n")"

    set_current_issue "$n"

    local pr; pr="$(gh pr list --head "$branch" --json number --jq '.[0].number // empty' 2>/dev/null)"
    if [ -z "$pr" ]; then
        log "issue #$n labeled $SHIPYARD_REVIEW_LABEL but no open PR for $branch → escalate"
        escalate "$n" "pr-missing" \
            "l'issue est étiquetée $SHIPYARD_REVIEW_LABEL mais aucune PR ouverte n'existe pour $branch" \
            "ouvre une PR pour $branch ou remets le label $SHIPYARD_TODO_LABEL pour relancer le développement" \
            "$SHIPYARD_REVIEW_LABEL"
        return 1
    fi

    # Rebuild strictly from the branch the dev phase pushed — no base fallback,
    # this branch must already exist (the PR above proves it does).
    _setup_review_worktree() {
        rm -rf "$wt"
        git worktree remove --force "$wt" 2>/dev/null || true
        git fetch --quiet origin "$branch:refs/remotes/origin/$branch" 2>/dev/null || true
        git worktree add -B "$branch" "$wt" "origin/$branch" >/dev/null 2>&1
    }
    if ! _with_lock "$REPO_ROOT/.project/.git.lock" _setup_review_worktree; then
        git worktree remove --force "$wt" 2>/dev/null || true
        escalate "$n" "pr-missing" "impossible de reconstruire le worktree pour $branch" \
            "vérifie que la branche $branch existe encore, puis remets le label $SHIPYARD_TODO_LABEL" \
            "$SHIPYARD_REVIEW_LABEL"
        return 1
    fi

    # The dev phase already validated the package scope; if it would now fail
    # (label changed mid-review) proceed permissively with an empty scope
    # rather than escalate mid-review — package_diff_violations degrades safely
    # with an empty scope, and re-escalating here would be a second, redundant
    # gate on a decision the dev phase already made.
    local package_scope=""
    package_scope="$(package_scope_for_issue "$n")" || true
    local ctx; ctx="$(build_issue_context "$n" "$branch" "$package_scope")"

    # Resume any budget a previous run/phase already spent — a fresh MAX_REVIEW
    # budget on every resume is what let a REVIEW-labeled issue survive far more
    # than MAX_REVIEW real rounds across several recoveries.
    local round conflict_fixes rc_pair
    rc_pair="$(_review_state_get "$n")"
    round="$(cut -f1 <<<"$rc_pair")"
    conflict_fixes="$(cut -f2 <<<"$rc_pair")"

    # ── REVIEW loop: HARD gate (CI) first, agent judgement second ────────────
    local verdict review_out review_ctx review_prompt ci_timeout_retries=0
    # `-le`, not `-lt`: MAX_REVIEW bounds the *fix* rounds, and every fix has to
    # be read by someone. The old `-lt` bound ran review→fix exactly MAX_REVIEW
    # times then fell straight through to escalate, so the last fix was pushed
    # and never reviewed — the escalation was decided on the state of the code
    # one round earlier. #191 escalated 54s after a commit that addressed all
    # three points of the round-3 review, and a human had to re-read a PR the
    # loop could have merged. One extra pass reviews that final fix; the guard
    # before the fix step below keeps that pass review-only.
    while [ "$round" -le "$MAX_REVIEW" ]; do
        round=$((round + 1))
        _review_state_set "$n" "$round" "$conflict_fixes"

        # Hard gate: objective signals. Waits for checks to register + complete.
        local ci_rc=0
        ci_is_green "$pr" || ci_rc=$?

        if [ "$ci_rc" -eq 2 ]; then
            # Timed out with nothing reported as failed: there is nothing to review
            # and nothing to fix, only more CI to wait out. Treating this as a
            # verdict used to burn a review round AND a dev fix session on a PR
            # that was never broken — the fix session, correctly finding nothing
            # to change, escalated needs-human for a problem that resolves itself.
            # Retry the wait, bounded and NOT counted against the review budget
            # (same rationale as the conflict-fix retries below: nothing was judged).
            if [ "$ci_timeout_retries" -lt "$SHIPYARD_MAX_CI_TIMEOUT_RETRIES" ]; then
                ci_timeout_retries=$((ci_timeout_retries + 1))
                log "PR #$pr — CI pas stabilisée après ${SHIPYARD_CI_TIMEOUT}s, nouvelle attente (retry $ci_timeout_retries/$SHIPYARD_MAX_CI_TIMEOUT_RETRIES)"
                round=$((round - 1))
                _review_state_set "$n" "$round" "$conflict_fixes"
                continue
            fi
            # Still not settled after several full waits: at this point it is more
            # likely a stuck runner or CI infra issue than an unlucky race. Say
            # that plainly instead of routing through a fix session that has
            # nothing to fix.
            local total_wait=$(( (ci_timeout_retries + 1) * SHIPYARD_CI_TIMEOUT / 60 ))
            log "PR #$pr — CI toujours pas stabilisée après ${total_wait}min cumulées → escalade (souci d'infra CI probable)"
            git worktree remove --force "$wt" 2>/dev/null || true
            escalate "$n" "ci-timeout" \
                "la CI de la PR #$pr ne s'est jamais stabilisée après ${total_wait} minutes d'attente cumulée — probable souci d'infra CI (runner bloqué, job qui ne se termine jamais), pas un problème de code" \
                "regarde \`gh pr checks $pr\` et les runs GitHub Actions associés ; relance-les ou corrige l'infra, puis remets le label $SHIPYARD_REVIEW_LABEL" \
                "$SHIPYARD_REVIEW_LABEL"
            return 1
        fi

        if [ "$ci_rc" -ne 0 ]; then
            # Before blaming the code: a PR that conflicts with its base has no
            # mergeable ref, so the checks that ran judged a tree that will never
            # be integrated. Resolving used to happen only after a merge attempt
            # failed — i.e. only on the approve path — so a conflicting PR spent
            # its whole review budget being told "the CI is not green" about a
            # merge that was never going to happen.
            #
            # Asked only here, never on the green path: mergeability reads UNKNOWN
            # for a while after each push, and pr_conflicting pays for that in
            # sleeps. On the green path the merge attempt already catches it, and
            # by then the answer has settled. Bounded separately from the review
            # rounds and not counted as one — nothing was judged.
            if [ "$conflict_fixes" -lt "$SHIPYARD_MAX_CONFLICT_FIXES" ] && pr_conflicting "$pr"; then
                conflict_fixes=$((conflict_fixes + 1))
                log "PR #$pr — CI rouge sur une branche en conflit avec $SHIPYARD_BASE (tentative $conflict_fixes/$SHIPYARD_MAX_CONFLICT_FIXES)"
                if resolve_conflicts "$n" "PR #$pr" "$wt" "$branch" "$ctx" "$package_scope"; then
                    round=$((round - 1))   # the base moved; the branch was not judged
                    _review_state_set "$n" "$round" "$conflict_fixes"
                    continue
                fi
                log "PR #$pr — conflit non résolu automatiquement, on traite la CI"
            fi
            log "PR #$pr — CI not green (round $round)"
            verdict="request-changes"
            review_out="$(ci_failure_report "$pr")"
        else
            # Fresh reviewer session — judges acceptance criteria only. Opus remains
            # the production default; bounded E2E fixtures may select Haiku explicitly.
            review_ctx="$(mktemp)"
            { cat "$ctx"
              pr_size_note "$wt"
              echo; echo "## Diff de la PR #$pr"; echo
              gh pr diff "$pr" 2>/dev/null | head -c 60000
            } >"$review_ctx"
            review_prompt="$(render_prompt "$LOOP_DIR/prompt-review.md" "$review_ctx" qa-reviewer "${package_scope:-.}")"
            review_out="$(claude_invoke "$SHIPYARD_REVIEW_MODEL" "$review_prompt")" || { log "review failed #$pr"; break; }
            verdict="$(grep -m1 '^VERDICT:' <<<"$review_out" | sed 's/^VERDICT:[[:space:]]*//' | tr 'A-Z' 'a-z')"
        fi

        [ "$verdict" = "approve" ] || post_review_comment "$pr" "$round" "$MAX_REVIEW" "$verdict" "$review_out"

        if [ "$verdict" = "approve" ]; then
            # Serialize merges: two PRs merging into the same base at once can trip
            # "base out of date" / branch-protection races. One at a time is safe.
            _with_lock "$REPO_ROOT/.project/.merge.lock" merge_pr "$pr" \
                || {
                    log "merge failed for PR #$pr"
                    # Only NOW ask why. The base moves while a PR is in review (the
                    # loop merges other issues), so the usual cause is a conflict —
                    # resolvable. Asking before every merge would cost an API round
                    # trip on the happy path, which is nearly every merge.
                    if pr_conflicting "$pr" \
                       && resolve_conflicts "$n" "PR #$pr" "$wt" "$branch" "$ctx" "$package_scope"; then
                        continue   # new commits pushed → next round revalidates CI and review
                    fi
                    # Not a conflict, or not resolvable: a repository-level cause the
                    # loop cannot fix. Say so — this used to `break` out of the loop,
                    # parking the issue in review with no comment and no notification.
                    git worktree remove --force "$wt" 2>/dev/null || true
                    escalate "$n" "merge-failed" \
                        "le merge de la PR #$pr a été refusé et n'a pas pu être rattrapé automatiquement" \
                        "ouvre la PR #$pr et regarde le motif (conflit non résolvable ? protection de branche ?), corrige ou merge à la main, puis remets le label $SHIPYARD_REVIEW_LABEL" \
                        "$SHIPYARD_REVIEW_LABEL"
                    return 1
                }
            git worktree remove --force "$wt" 2>/dev/null || true
            finalize_merged_issue "$n" "$pr" "$SHIPYARD_REVIEW_LABEL" "$round" criteria
            return 0
        fi

        # Budget spent: this last pass is review-only. Fixing here would push a
        # commit no reviewer ever reads, and the human who picks the escalation
        # up would face a PR whose diff is one round ahead of the verdict just
        # posted on it (see the loop bound above).
        [ "$round" -le "$MAX_REVIEW" ] || break

        # request-changes → re-inject failures as context and fix (pressure cooker)
        log "PR #$pr — request-changes (round $round/$MAX_REVIEW), fixing"
        local fix_ctx fix_prompt fix_out fix_capture
        fix_ctx="$(mktemp)"
        { cat "$ctx"; echo; echo "## Retour de review à corriger"; echo; echo "$review_out"; } >"$fix_ctx"
        fix_prompt="$(render_prompt "$LOOP_DIR/prompt-dev.md" "$fix_ctx" developer "${package_scope:-.}")"
        fix_capture="$(mktemp)"
        ( cd "$wt"; claude_invoke sonnet "$fix_prompt" | shipyard_redact >"$fix_capture" ) \
            || { rm -f "$fix_capture"; log "fix session failed #$n"; break; }
        fix_out="$(<"$fix_capture")"
        rm -f "$fix_capture"
        # A human-blocking dependency can surface during a fix round too.
        if grep -q '^NEEDS-HUMAN:' <<<"$fix_out"; then
            local need2; need2="$(grep -m1 '^NEEDS-HUMAN:' <<<"$fix_out" | sed 's/^NEEDS-HUMAN:[[:space:]]*//')"
            log "issue #$n — fix step signaled a human-blocking dependency"
            git worktree remove --force "$wt" 2>/dev/null || true
            escalate "$n" "needs-human" "$need2" \
                "règle le point ci-dessus puis remets le label $SHIPYARD_REVIEW_LABEL" "$SHIPYARD_REVIEW_LABEL"
            return 1
        fi
        ( cd "$wt"
          fixmsg="$(grep -m1 '^COMMIT:' <<<"$fix_out" | sed 's/^COMMIT:[[:space:]]*//')"
          git add -A
          scope_violations="$(package_diff_violations "$wt" "$package_scope")"
          [ -z "$scope_violations" ] || { echo "out-of-scope changes: $scope_violations" >&2; exit 43; }
          git diff --cached --quiet || git commit -q -m "${fixmsg:-fix: address review on #$n}"
          git push -q origin "$branch" --force-with-lease
        ) || { log "fix push failed #$n"; break; }
        # A fix round changes the diff, so it also changes what the body should
        # say — and the fix session runs the same prompt, so it hands back a
        # PR-BODY block too. Dropping it is what let the body drift for rounds on
        # end while the reviewer kept bouncing the PR over it.
        sync_pr_body "$n" "$pr" "$wt" "$(pr_body_from "$fix_out")"
    done

    # Review budget exhausted → escalate (actionable).
    git worktree remove --force "$wt" 2>/dev/null || true
    escalate "$n" "review-exhausted" \
        "la PR #$pr n'a pas été validée après $round tours de review (le dernier correctif a bien été relu)" \
        "relis la PR #$pr et ses commentaires, corrige à la main si besoin, puis remets le label $SHIPYARD_REVIEW_LABEL" \
        "$SHIPYARD_REVIEW_LABEL"
    return 1
}

# ─────────────────────────────────────────────────────────────────────────────
# TRIAGE phase (Phase 0): re-judge what is labelled blocked.
#
# `escalate()` is deliberately quick to fire — a dead end must never be silent.
# The cost of that is a queue of hypotheses that rot: the PR an issue waited on
# gets merged, the human answers in a comment, the sibling issue that made it a
# duplicate is closed. Nothing ever re-read them, so every escalation was a
# one-way door and the operator was the only garbage collector.
#
# This phase re-opens each door. An Opus session is handed the CURRENT state —
# the recorded blocker, the human replies posted since, the PR and its CI, and
# the real status of every issue the escalation points at — and returns ONE
# decision. The session never touches GitHub: it judges, and the code below
# applies. That split is the whole safety model — a merge, a close or a label
# change is a deterministic consequence of a parsed verdict, never a tool call
# an agent talked itself into.
#
# What stays blocked is only what a human alone can supply: a secret, a missing
# business datum, a product decision, an action outside the repository.
# ─────────────────────────────────────────────────────────────────────────────

pr_for_issue() {  # pr_for_issue <issue> → open PR number for feat/<issue>, or empty
    gh pr list --head "feat/$(ticket_slug "$1")" --state open --json number --jq '.[0].number // empty' 2>/dev/null || true
}

# One line of hard, current facts about an issue's PR. The escalation text says
# what someone believed a cycle ago; this says what GitHub reports now, and it is
# the difference between the two that triage exists to catch.
pr_state_line() {  # pr_state_line <issue>
    local n="$1" pr json ci
    pr="$(pr_for_issue "$n")"
    [ -n "$pr" ] || { printf 'aucune PR ouverte'; return 0; }
    json="$(gh pr view "$pr" --json mergeable,reviewDecision 2>/dev/null || echo '{}')"
    if ci_is_green_now "$pr"; then ci="verte"; else ci="rouge ou en attente"; fi
    printf 'PR #%s — CI %s, mergeable: %s, revue: %s' "$pr" "$ci" \
        "$(jq -r '.mergeable // "UNKNOWN"' <<<"$json" 2>/dev/null || echo UNKNOWN)" \
        "$(jq -r '.reviewDecision // "aucune"' <<<"$json" 2>/dev/null || echo aucune)"
}

# Every issue the escalation or the issue body points at, resolved to its real
# state. This is the single most valuable block in the context: a dependency chain
# escalation ("#268 attend #267 qui attend #266") is unfalsifiable from the text
# alone, and is answered instantly by the list below.
referenced_issues_context() {  # referenced_issues_context <issue> <text>
    local self="$1" text="$2" refs n info out=""
    # How a ticket cites another one is the tracker's notation, not the loop's.
    refs="$(ticket_extract_refs "$text" | grep -vx "$self" \
            | head -"$SHIPYARD_TRIAGE_MAX_REFS")" || refs=""
    [ -n "$refs" ] || return 0
    for n in $refs; do
        info="$(ticket_meta "$n")" || continue
        [ -n "$info" ] || continue
        out+="$(printf -- '- #%s « %s » — %s, labels: %s — %s\n' "$n" \
            "$(jq -r '.title // "?"' <<<"$info" 2>/dev/null || echo '?')" \
            "$(jq -r '.state // "?"' <<<"$info" 2>/dev/null || echo '?')" \
            "$(jq -r '[.labels[]?.name] | join(", ") // ""' <<<"$info" 2>/dev/null || echo '')" \
            "$(pr_state_line "$n")")"$'\n'
    done
    [ -n "$out" ] || return 0
    printf '\n## Issues référencées — état réel (autorité, pas le récit de l’escalade)\n\n%s' "$out"
}

build_blocked_context() {  # build_blocked_context <issue> <passes> → path
    local n="$1" passes="$2" ctx blocker reason rem kind refs_seed
    ctx="$(mktemp)"
    ticket_context "$n" >"$ctx" 2>/dev/null || echo "## Issue $(ticket_ref "$n")" >"$ctx"

    blocker="$(jq -r --argjson n "$(_id_json "$n")" \
        '((.loop.blockers // []) | map(select(.issue == $n)) | first) // {}' "$STATE" 2>/dev/null || echo '{}')"
    kind="$(jq -r '.kind // "inconnu"' <<<"$blocker" 2>/dev/null || echo inconnu)"
    reason="$(jq -r '.reason // "(aucune cause enregistrée)"' <<<"$blocker" 2>/dev/null || echo '(aucune cause enregistrée)')"
    rem="$(jq -r '.remediation // ""' <<<"$blocker" 2>/dev/null || echo '')"
    {
        printf '\n## Cause enregistrée par la boucle\n\n- **Type** : %s\n- **Cause** : %s\n' "$kind" "$reason"
        [ -n "$rem" ] && printf -- '- **Action demandée à l’humain** : %s\n' "$rem"
        printf -- '- **Passes de triage déjà faites sur cette issue** : %s\n' "$passes"
    } >>"$ctx"

    human_replies "$n" >>"$ctx"
    pr_feedback "$n" "feat/$(ticket_slug "$n")" >>"$ctx"
    # Seed the reference scan with the issue body AND the escalation text: the
    # chain is usually named in the escalation, not in the issue.
    refs_seed="$(cat "$ctx" 2>/dev/null)$reason $rem"
    referenced_issues_context "$n" "$refs_seed" >>"$ctx"

    jq -r --argjson n "$(_id_json "$n")" '(.loop.blockers // []) | map(select(.issue != $n))
        | if length == 0 then "" else
            "\n## Autres blocages en cours (le tien n’est peut-être qu’un maillon)\n\n"
            + (map("- #\(.issue) — \(.kind) : \(.reason[0:200])") | join("\n")) + "\n"
          end' "$STATE" 2>/dev/null >>"$ctx" || true

    printf '\n## Derniers commits sur %s\n\n```\n%s\n```\n' "$SHIPYARD_BASE" \
        "$(git -C "$REPO_ROOT" log --oneline -15 "origin/$SHIPYARD_BASE" 2>/dev/null || echo '(indisponible)')" >>"$ctx"
    printf '%s' "$ctx"
}

_triage_field() {  # _triage_field <NAME> <text>
    grep -m1 "^$1:" <<<"$2" 2>/dev/null | sed "s/^$1:[[:space:]]*//" | head -1 || true
}

# Put ONE issue back in a queue. Shared by the decision applied to the blocked
# issue itself and by every REQUEUE target, so a released chain head and a
# released issue are handled by the same code.
#
# The `review` route is where the merge authority lives, and it is deliberately
# narrow: triage merges only a PR that is BOTH green and already approved by a
# reviewer session — i.e. a delivery that was finished and simply never landed.
# Anything less goes back to the review phase, which judges it this same run.
#
# The outcome is published through TRIAGE_LAST_ACTION rather than stdout: every
# helper this calls logs to stdout, so a `$(...)` capture would swallow the whole
# run's log lines into the issue comment and hide them from the operator.
TRIAGE_LAST_ACTION=""
triage_requeue() {  # triage_requeue <issue> <todo|review> — sets TRIAGE_LAST_ACTION
    local t="$1" want="$2" state pr json labels
    TRIAGE_LAST_ACTION=""
    state="$(ticket_meta "$t" || true)"
    labels="$(jq -r '[.labels[]?.name] | join(" ")' <<<"$state" 2>/dev/null || true)"
    state="$(jq -r '.state // empty' <<<"$state" 2>/dev/null || true)"
    if [ -n "$state" ] && [ "$state" != "OPEN" ]; then
        log "triage: #$t est $state — rien à relancer"
        return 1
    fi
    pr="$(pr_for_issue "$t")"
    # An issue whose work is already pushed never goes back to the dev queue. A dev
    # pass over an open PR's branch can only produce an empty diff and escalate
    # "no-output" — the #138/PR #149 deadlock — and a second triage decision in the
    # same run must not undo the first one that correctly routed it to review.
    if [ "$want" = todo ] && [ -n "$pr" ]; then
        log "triage: #$t porte la PR #$pr — relance en $SHIPYARD_REVIEW_LABEL, pas en $SHIPYARD_TODO_LABEL"
        want=review
    fi
    # Already where it is being asked to go: say so and touch nothing. Rewriting the
    # label would churn the board and, worse, look like a fresh claim to whatever
    # phase is already working on it.
    # A target already in the right queue is healthy by definition: retire whatever
    # stale blocker record it still carries, then leave the labels alone.
    _triage_already_queued() {  # <human-readable state>
        log "triage: #$t $1 — laissée en place"
        _clear_blocker "$t"
        _triage_state_clear "$t"
        return 0
    }
    case " $labels " in
        *" $SHIPYARD_REVIEW_LABEL "*) [ "$want" = review ] && {
            _triage_already_queued "est déjà en $SHIPYARD_REVIEW_LABEL"
            TRIAGE_LAST_ACTION="déjà en review (PR #${pr:-?})"; return 0; } ;;
        *" $SHIPYARD_TODO_LABEL "*) [ "$want" = todo ] && {
            _triage_already_queued "est déjà en $SHIPYARD_TODO_LABEL"
            TRIAGE_LAST_ACTION="déjà dans la file de développement"; return 0; } ;;
        *" $SHIPYARD_WIP_LABEL "*)
            _triage_already_queued "est en cours de développement"
            TRIAGE_LAST_ACTION="déjà en cours de développement"; return 0 ;;
    esac
    if [ "$want" = review ]; then
        if [ -z "$pr" ]; then
            log "triage: #$t n'a pas de PR ouverte — relance en $SHIPYARD_TODO_LABEL"
            want=todo
        else
            json="$(gh pr view "$pr" --json reviewDecision 2>/dev/null || echo '{}')"
            if [ "$(jq -r '.reviewDecision // ""' <<<"$json" 2>/dev/null || true)" = APPROVED ] \
               && ci_is_green_now "$pr"; then
                log "triage: PR #$pr (issue #$t) verte et déjà approuvée → merge"
                if _with_lock "$REPO_ROOT/.project/.merge.lock" merge_pr "$pr"; then
                    finalize_merged_issue "$t" "$pr" "" 0
                    TRIAGE_LAST_ACTION="mergée (PR #$pr)"
                    return 0
                fi
                log "triage: merge de la PR #$pr refusé — retour en review"
            fi
            ticket_adopt "$t"
            ticket_set_status_exclusive "$t" "$SHIPYARD_REVIEW_LABEL"
            _clear_blocker "$t"
            _triage_state_clear "$t"
            vault_task_status "$t" in-review "PR #$pr"
            TRIAGE_LAST_ACTION="renvoyée en review (PR #$pr)"
            return 0
        fi
    fi
    ticket_adopt "$t"
    ticket_set_status_exclusive "$t" "$SHIPYARD_TODO_LABEL"
    _clear_blocker "$t"
    _triage_state_clear "$t"
    vault_task_status "$t" todo "débloquée par le triage"
    TRIAGE_LAST_ACTION="remise en développement"
    return 0
}

# `REQUEUE: #266=todo, #275=review` — the chain lever. Capped, because a verdict
# that releases five issues at once has stopped reasoning about what is actually
# deliverable now and started guessing at a plan.
TRIAGE_REQUEUED=""
triage_apply_requeue() {  # triage_apply_requeue <source-issue> <line> — sets TRIAGE_REQUEUED
    local src="$1" line="$2" entry t want done_ct=0 out=""
    TRIAGE_REQUEUED=""
    [ -n "$line" ] || return 0
    while IFS= read -r entry; do
        [ -n "$entry" ] || continue
        [ "$done_ct" -lt "$SHIPYARD_TRIAGE_MAX_REQUEUE" ] || {
            log "triage: #$src — au-delà de $SHIPYARD_TRIAGE_MAX_REQUEUE relances, le reste attendra le prochain cycle"
            break
        }
        t="$(grep -oE '[0-9]+' <<<"${entry%%=*}" | head -1 || true)"
        [ -n "$t" ] || continue
        [ "$t" = "$src" ] && continue     # the decision line already covers the issue itself
        case "${entry##*=}" in *review*) want=review ;; *) want=todo ;; esac
        triage_requeue "$t" "$want" || continue
        log "triage: #$src relance #$t — $TRIAGE_LAST_ACTION"
        done_ct=$((done_ct + 1))
        out+="#$t $TRIAGE_LAST_ACTION, "
        [ -n "${RUN_LEDGER:-}" ] && printf 'unblocked\t%s\t%s\t%s\n' "$t" "requeue-$want" "relancée via le triage de #$src" >>"$RUN_LEDGER" 2>/dev/null || true
    done < <(tr ',' '\n' <<<"$line")
    TRIAGE_REQUEUED="${out%, }"
    return 0
}

# One blocked issue, one fresh Opus session, one applied decision.
process_blocked_issue() {  # process_blocked_issue <issue> <passes> <comment-count> <last-ask>
    local n="$1" passes="$2" comments="$3" last_ask="$4"
    local branch="feat/$(ticket_slug "$n")" wt="$REPO_ROOT/.worktrees/triage-$(ticket_slug "$n")"
    local ctx prompt out decision reason ask dup requeue_line requeued fixed commit_msg
    local package_scope="" has_branch=0

    log "triage: rejugement du blocage sur #$n (passe $((passes + 1)))"
    package_scope="$(package_scope_for_issue "$n")" || package_scope=""

    # Work from the issue's own branch when it exists — that is where a fixable
    # blocker (conflict, red CI, half-finished work) actually lives. Otherwise a
    # clean base tree is enough to read the code and judge.
    #
    # The fetch happens BEFORE the locked helper and the answer is read from the
    # ref, not from the helper's own variable: _with_lock runs its command in a
    # subshell, so anything assigned inside it is lost — has_branch would have read
    # 0 forever, silently disabling every code fix.
    _with_lock "$REPO_ROOT/.project/.git.lock" \
        git -C "$REPO_ROOT" fetch --quiet origin "$branch:refs/remotes/origin/$branch" 2>/dev/null || true
    git -C "$REPO_ROOT" rev-parse --verify -q "refs/remotes/origin/$branch" >/dev/null 2>&1 \
        && has_branch=1 || has_branch=0
    _setup_triage_worktree() {
        rm -rf "$wt"
        git worktree remove --force "$wt" 2>/dev/null || true
        if [ "$has_branch" = 1 ]; then
            git -C "$REPO_ROOT" worktree add -B "$branch" "$wt" "origin/$branch" >/dev/null 2>&1
        else
            git -C "$REPO_ROOT" fetch --quiet origin "$SHIPYARD_BASE" 2>/dev/null || true
            git -C "$REPO_ROOT" worktree add --detach "$wt" "origin/$SHIPYARD_BASE" >/dev/null 2>&1 \
                || git -C "$REPO_ROOT" worktree add --detach "$wt" "$SHIPYARD_BASE" >/dev/null 2>&1
        fi
    }
    if ! _with_lock "$REPO_ROOT/.project/.git.lock" _setup_triage_worktree; then
        log "triage: #$n — worktree impossible, blocage laissé en l'état"
        git worktree remove --force "$wt" 2>/dev/null || true
        return 1
    fi

    ctx="$(build_blocked_context "$n" "$passes")"
    prompt="$(render_prompt "$LOOP_DIR/prompt-unblock.md" "$ctx" tech-lead "${package_scope:-.}")"
    # `gh` withheld at the CLI, not merely discouraged in the prompt: this session
    # decides whether an issue is merged, closed or requeued, and a prompt line is
    # advice a model can reason its way around. Everything it needs to know about
    # GitHub is already in its context, assembled above. Agent/Task are withheld for
    # the same reason as the conflict resolver — a nested reasoning loop re-reading
    # the whole worktree costs far more than the judgement being asked for.
    out="$( cd "$wt" && SHIPYARD_DISALLOWED_TOOLS="Agent Task Bash(gh:*)" \
            claude_invoke "$SHIPYARD_TRIAGE_MODEL" "$prompt" | shipyard_redact )" || {
        log "triage: #$n — session d'arbitrage en échec, blocage laissé en l'état"
        rm -f "$ctx" "$prompt"
        git worktree remove --force "$wt" 2>/dev/null || true
        return 1
    }
    rm -f "$ctx" "$prompt"

    decision="$(_triage_field DECISION "$out" | tr 'A-Z' 'a-z')"
    reason="$(_triage_field REASON "$out")"
    ask="$(_triage_field NEEDS-HUMAN "$out")"
    dup="$(_triage_field DUPLICATE-OF "$out")"
    requeue_line="$(_triage_field REQUEUE "$out")"
    fixed="$(_triage_field FIXED "$out" | tr 'A-Z' 'a-z')"
    commit_msg="$(_triage_field COMMIT "$out")"

    # An unparseable verdict is not a licence to act: leave the issue exactly as it
    # was. Silence here costs one cycle; a guessed decision costs a wrong merge.
    case "$decision" in
        requeue-todo|requeue-review|close-duplicate|wait-dependency|still-blocked) : ;;
        *)  log "triage: #$n — verdict illisible ('${decision:-vide}'), blocage inchangé"
            git worktree remove --force "$wt" 2>/dev/null || true
            _triage_state_set "$n" "$((passes + 1))" "$comments" "$last_ask"
            return 1 ;;
    esac

    # Code the arbiter wrote: only ever on the issue's own branch, and only when a
    # PR already carries it — a blocked issue with no branch has no reviewed home
    # for a commit, and pushing a new one from here would bypass the dev phase's
    # gates. The documentation pass runs on the same working tree, before the
    # commit, exactly as the dev phase does it.
    if [ "$fixed" = yes ] && [ "${SHIPYARD_TRIAGE_ALLOW_FIX:-1}" != 0 ] && [ "$has_branch" = 1 ] \
       && ! ( cd "$wt" && git diff --quiet && git diff --cached --quiet ) 2>/dev/null; then
        doc_pass "$wt" "$n" "${package_scope:-.}" || true
        if ( cd "$wt"
             git add -A
             scope_violations="$(package_diff_violations "$wt" "$package_scope")"
             [ -z "$scope_violations" ] || { echo "out-of-scope changes: $scope_violations" >&2; exit 43; }
             git diff --cached --quiet || git commit -q -m "${commit_msg:-fix: débloque #$n}"
             git push -q origin "$branch" --force-with-lease ); then
            log "triage: #$n — correctif poussé sur $branch"
        else
            log "triage: #$n — correctif non poussé (hors périmètre ou push refusé), décision appliquée quand même"
        fi
    elif [ "$fixed" = yes ] && [ "$has_branch" != 1 ]; then
        log "triage: #$n — correctif ignoré: aucune branche $branch pour le porter (la phase dev le refera)"
    fi
    git worktree remove --force "$wt" 2>/dev/null || true

    triage_apply_requeue "$n" "$requeue_line"
    requeued="$TRIAGE_REQUEUED"
    local note=""
    [ -n "$requeued" ] && note="

Relancé en même temps : $requeued."

    case "$decision" in
        requeue-todo|requeue-review)
            local did
            triage_requeue "$n" "${decision#requeue-}" && did="$TRIAGE_LAST_ACTION" || did="relance refusée"
            ticket_comment "$n" "$(printf '🔓 **Blocage levé par le triage**\n\n- **Constat** : %s\n- **Suite** : %s%s' \
                "${reason:-(non précisé)}" "$did" "$note")"
            _triage_state_clear "$n"
            [ -n "${RUN_LEDGER:-}" ] && printf 'unblocked\t%s\t%s\t%s\n' "$n" "$decision" "${reason:-}" >>"$RUN_LEDGER" 2>/dev/null || true
            shipyard_notify "🔓 Blocage #$n levé automatiquement — $did"
            return 0 ;;
        close-duplicate)
            local target; target="$(grep -oE '[0-9]+' <<<"$dup" | head -1 || true)"
            if [ -z "$target" ]; then
                log "triage: #$n — close-duplicate sans DUPLICATE-OF, blocage inchangé"
                _triage_state_set "$n" "$((passes + 1))" "$comments" "$last_ask"
                return 1
            fi
            ticket_comment "$n" "$(printf '🔁 **Fermée par le triage — doublon de #%s**\n\n%s%s' \
                "$target" "${reason:-(non précisé)}" "$note")"
            ticket_close "$n" "not planned"
            _clear_blocker "$n"
            _triage_state_clear "$n"
            vault_task_status "$n" done "doublon de #$target"
            [ -n "${RUN_LEDGER:-}" ] && printf 'unblocked\t%s\t%s\t%s\n' "$n" "close-duplicate" "doublon de #$target" >>"$RUN_LEDGER" 2>/dev/null || true
            shipyard_notify "🔁 Issue #$n fermée — doublon de #$target"
            return 0 ;;
    esac

    # wait-dependency: the issue is not deliverable yet, but nothing is being asked
    # of a human — its chain head was just released above and will land in this run
    # or the next. It stays blocked, its recorded cause is refreshed so the next
    # pass reads the truth, and NOTHING is notified: waking someone up for a
    # dependency the loop is already resolving is precisely the noise that made
    # escalations unreadable.
    if [ "$decision" = wait-dependency ]; then
        _record_blocker "$n" "waiting-dependency" "${reason:-attend une dépendance en cours de livraison}" \
            "aucune action requise : la boucle livre d'abord la dépendance, cette issue repartira seule"
        _triage_state_set "$n" "$((passes + 1))" "$comments" "$last_ask"
        vault_task_status "$n" blocked "waiting-dependency"
        log "triage: #$n — en attente d'une dépendance, aucune sollicitation humaine${requeued:+ (relancé: $requeued)}"
        return 0
    fi

    # still-blocked: a real human dependency. Say it ONCE. An ask identical to the
    # one already on the issue is not news — re-posting it every run is how a
    # notification channel becomes noise the operator learns to ignore.
    [ -n "$ask" ] || ask="${reason:-blocage confirmé par le triage, cause non précisée}"
    if [ "$ask" = "$last_ask" ]; then
        log "triage: #$n — blocage humain confirmé, demande inchangée (pas de nouvelle alerte)"
        _triage_state_set "$n" "$((passes + 1))" "$comments" "$ask"
        return 0
    fi
    log "triage: #$n — blocage humain confirmé, demande reformulée"
    escalate "$n" "needs-human" "$ask" \
        "règle le point ci-dessus, puis remets le label $SHIPYARD_TODO_LABEL (ou réponds simplement en commentaire : le triage relit les réponses)" \
        "$SHIPYARD_BLOCKED_LABEL"
    _triage_state_set "$n" "$((passes + 1))" "$(ticket_comments_count "$n" "$comments")" "$ask"
    return 0
}

# Budget: an issue is re-judged SHIPYARD_TRIAGE_MAX_PASSES times, then goes quiet —
# an Opus session per run on a blocker whose answer has not moved buys nothing.
#
# What re-opens the budget is whatever can actually change the verdict, and that
# differs by kind. For a human blocker it is the human answering — a new comment.
# For a chain link it is its dependency landing, so the delivery counter moving is
# enough; without that clause a `wait-dependency` issue would fall silent after three
# runs and never be released even once the work it waits on had shipped, which is the
# very deadlock this phase exists to break.
_triage_should_run() {  # _triage_should_run <issue> <passes> <last-comments> <now-comments> <last-merged>
    local n="$1" passes="$2" seen="$3" now="$4" seen_merged="$5" kind merged_now
    [ "$passes" -lt "$SHIPYARD_TRIAGE_MAX_PASSES" ] && return 0
    [ "$now" -gt "$seen" ] && { log "triage: #$n — budget épuisé mais l'humain a répondu, rejugement"; return 0; }
    kind="$(jq -r --argjson n "$(_id_json "$n")" \
        '((.loop.blockers // []) | map(select(.issue == $n)) | first | .kind) // ""' "$STATE" 2>/dev/null || true)"
    if [ "$kind" = "waiting-dependency" ]; then
        merged_now="$(jq -r '.loop.merged_total // 0' "$STATE" 2>/dev/null || echo 0)"
        [[ "$merged_now" =~ ^[0-9]+$ ]] || merged_now=0
        [ "$merged_now" -gt "$seen_merged" ] && {
            log "triage: #$n — une dépendance a été livrée depuis la dernière passe, rejugement"; return 0; }
        log "triage: #$n — attend toujours sa dépendance, rien de livré depuis la dernière passe"
        return 1
    fi
    log "triage: #$n — $passes passes sans élément nouveau, en attente d'une réponse humaine"
    return 1
}

# Blocked tickets are scanned across the WHOLE tracker, not just the current
# sprint. A blocker outlives the iteration that raised it — a sprint advances
# even when it ends with blocked work — so a sprint-only scan would leave exactly
# the oldest, most stale escalations unexamined forever. ticket_scan_in_status()
# is the widened query; see its contract for why review uses it too.
triage_scan_issues() {
    ticket_scan_in_status "Blocked"
}

triage_blocked_issues() {
    [ "${SHIPYARD_TRIAGE:-1}" != 0 ] || return 0
    local n examined=0 st passes comments last_merged last_ask now
    # Least-judged first. Scanning in issue order starves the tail whenever the
    # queue is longer than SHIPYARD_MAX_TRIAGE_PER_RUN: the same head five are
    # re-judged every run and the sixth is never looked at. Ordering by pass count
    # makes the cap a rotation instead of a wall — observed with 9 blocked issues
    # and a cap of 5, where four of them would have waited three full runs.
    local -a candidates=()
    for n in $(triage_scan_issues); do
        [ -n "$n" ] || continue
        candidates+=("$(cut -f1 <<<"$(_triage_state_get "$n")") $n")
    done
    [ "${#candidates[@]}" -gt 0 ] || return 0
    while read -r passes n; do
        [ -n "$n" ] || continue
        loop_is_paused && { log "triage: pause manuelle observée"; break; }
        if [ "$examined" -ge "$SHIPYARD_MAX_TRIAGE_PER_RUN" ]; then
            log "triage: plafond de $SHIPYARD_MAX_TRIAGE_PER_RUN blocage(s) par run atteint — le reste au prochain cycle"
            break
        fi
        st="$(_triage_state_get "$n")"
        passes="$(cut -f1 <<<"$st")"; comments="$(cut -f2 <<<"$st")"
        last_merged="$(cut -f3 <<<"$st")"; last_ask="$(cut -f4- <<<"$st")"
        now="$(ticket_comments_count "$n")"
        _triage_should_run "$n" "$passes" "$comments" "$now" "$last_merged" || continue
        examined=$((examined + 1))
        process_blocked_issue "$n" "$passes" "$now" "$last_ask" || true
    done < <(printf '%s\n' "${candidates[@]}" | sort -k1,1n -k2,2n)
    [ "$examined" -gt 0 ] && log "triage: $examined blocage(s) rejugé(s)"
    return 0
}

# ── Sprint retrospective (auto, end of a drained sprint) ─────────────────────
# Where the retro file lives: the vault's sprints dir in vault mode, else the
# repo's .project/sprints. Mirrors render-templates.sh path resolution.
retro_dir() {
    local vp; vp="$(jq -r '.vault_project_path // ""' "$STATE" 2>/dev/null || true)"
    if [ -n "$vp" ] && [ "$vp" != "null" ]; then echo "$vp/sprints"; else echo "$REPO_ROOT/.project/sprints"; fi
}

# Generate a retrospective from the run LEDGER. Facts are computed here
# (deterministic, authoritative); the qualitative analysis is a fresh, cheap
# agent session grounded strictly in those facts. Writes a markdown file and —
# for async phone review — opens a GitHub issue (idempotent per sprint). Fully
# best-effort: never fails the loop. Disable with SHIPYARD_RETRO=0; file-only
# with SHIPYARD_RETRO_ISSUE=0; model via SHIPYARD_RETRO_MODEL (default haiku).
sprint_retrospective() {
    [ -f "${RUN_LEDGER:-}" ] || return 0
    local merged_ct esc_ct unb_ct sprint_no today dir file facts prompt prose pend
    merged_ct="$(grep -c '^merged' "$RUN_LEDGER" || true)";       merged_ct="${merged_ct:-0}"
    esc_ct="$(grep -c '^escalated' "$RUN_LEDGER" || true)";       esc_ct="${esc_ct:-0}"
    unb_ct="$(grep -c '^unblocked' "$RUN_LEDGER" || true)";       unb_ct="${unb_ct:-0}"
    [ "$merged_ct" -eq 0 ] && [ "$esc_ct" -eq 0 ] && [ "$unb_ct" -eq 0 ] && return 0  # nothing worth a retro

    sprint_no="$(jq -r '.current_sprint // 1' "$STATE" 2>/dev/null || echo 1)"
    today="$(date +%F 2>/dev/null || echo '')"
    dir="$(retro_dir)"; mkdir -p "$dir" 2>/dev/null || true
    file="$dir/retro-sprint-$(printf '%03d' "$sprint_no" 2>/dev/null || echo "$sprint_no").md"
    pend="$(jq -r '(.loop.blockers // []) | length' "$STATE" 2>/dev/null || echo 0)"

    # 1) Deterministic facts block.
    facts="$(mktemp)"
    {
        echo "### Résultats (faits)"
        echo "- Issues livrées (mergées) : $merged_ct"
        grep '^merged' "$RUN_LEDGER" 2>/dev/null | while IFS=$'\t' read -r _ n pr rounds; do
            echo "  - #$n (PR #$pr, ${rounds:-?} tour(s) de review)"
        done
        echo "- Issues escaladées (bloquées) : $esc_ct"
        grep '^escalated' "$RUN_LEDGER" 2>/dev/null | while IFS=$'\t' read -r _ n kind reason; do
            echo "  - #$n — $kind : $reason"
        done
        echo "- Blocages levés par le triage : $unb_ct"
        grep '^unblocked' "$RUN_LEDGER" 2>/dev/null | while IFS=$'\t' read -r _ n decision reason; do
            echo "  - #$n — $decision : $reason"
        done
        echo "- Blocages en attente d'action humaine : $pend"
    } >"$facts"

    # 2) Qualitative analysis — fresh, cheap agent, grounded in the facts.
    prose=""
    if [ "${SHIPYARD_RETRO_ANALYSIS:-1}" != 0 ]; then
        prompt="$(mktemp)"
        cat "$LOOP_DIR/prompt-retro.md" >"$prompt"
        { printf '\n\n---\n# Faits du sprint %s\n\n' "$sprint_no"; cat "$facts"; } >>"$prompt"
        prose="$(claude_invoke "${SHIPYARD_RETRO_MODEL:-haiku}" "$prompt" 2>/dev/null || true)"
        rm -f "$prompt"
    fi

    # 3) Assemble the file (facts authoritative; prose is the qualitative layer).
    {
        echo "# Rétrospective — Sprint $sprint_no"
        [ -n "$today" ] && echo "> Généré automatiquement par la boucle shipyard le $today"
        echo
        cat "$facts"
        if [ -n "$prose" ]; then echo; echo "### Analyse"; echo; printf '%s\n' "$prose"; fi
    } >"$file"
    rm -f "$facts"
    log "retrospective written: $file"

    # 4) Async surface: one ticket per sprint (idempotent), so you review it from
    #    your phone. Labelled 'retro' only — never status:todo, so the loop won't
    #    pick it up as work.
    if [ "${SHIPYARD_RETRO_ISSUE:-1}" != 0 ]; then
        local title existing
        title="chore(retro): sprint $sprint_no — $merged_ct livrée(s), $esc_ct bloquée(s)"
        existing="$(ticket_find_open_by_title "chore(retro): sprint $sprint_no")"
        if [ -z "$existing" ]; then
            ticket_ensure_label retro 5319e7 "Sprint retrospective"
            if ticket_create "$title" "$file" retro; then
                log "retrospective issue opened"
            else
                log "could not open retro issue (non-fatal — file is on disk)"
            fi
        else
            log "retro issue already open ($(ticket_ref "$existing")) — updated the file only"
        fi
    fi

    shipyard_notify "📊 Rétro sprint $sprint_no prête — $merged_ct livrée(s), $esc_ct bloquée(s)"
    return 0
}

# Enumerate the tickets awaiting review. Shared by main()'s review phase and
# recover_in_flight() — the sole thing that changes between "review right after
# this run's own dev phase" and "resume a review a previous run/crash left
# mid-flight" is WHEN this is called, not HOW the candidates are found.
#
# ticket_scan_in_status() is the WIDENED query, deliberately — this is the ONE
# queue where a miss is unrecoverable. Every other queue can afford to drop a row
# (the next run picks it up), but a ticket dropped here has already left the dev
# phase with its PR open and no phase owns it again. A widened query can only
# ever add rows, never hide one, and process_issue_review() is idempotent:
# re-reading a ticket that is already merged costs one API call.
review_scan_issues() {
    ticket_scan_in_status "In Review"
}

# On (re)start, resume any issue a previous run left mid-flight (killed, rebooted, or
# picked up after a long back-off). status:blocked issues are left alone — they wait for
# a human. A WIP issue resumes through process_issue_dev (idempotent: reuses the existing
# branch/PR); a REVIEW issue goes straight to process_issue_review — it already has a PR,
# re-running a dev session for it would be pure waste and used to also throw away whatever
# review budget it had already spent (round/conflict_fixes are persisted now, see
# _review_state_get, so this resumes the actual count instead of granting a fresh one).
recover_in_flight() {
    local n handled=0
    for n in $(ticket_list_in_status "In Progress"); do
        log "resume: recovering in-flight issue #$n (was '$SHIPYARD_WIP_LABEL')"
        process_issue_dev "$n" || log "issue #$n did not complete on recovery"
        handled=1
    done
    for n in $(review_scan_issues); do
        log "resume: recovering in-flight issue #$n (was '$SHIPYARD_REVIEW_LABEL')"
        process_issue_review "$n" || log "issue #$n did not complete on recovery"
        handled=1
    done
    [ "$handled" = 1 ] && log "resume: in-flight recovery done"
    return 0
}

# ── Main loop ────────────────────────────────────────────────────────────────
main() {
    command -v gh   >/dev/null || { echo "gh not found" >&2; exit 1; }
    command -v jq   >/dev/null || { echo "jq not found" >&2; exit 1; }
    command -v claude >/dev/null || { echo "claude (Claude Code) not found" >&2; exit 1; }
    # Authenticate once on the host before spawning fresh Claude sessions. The
    # project sandbox deliberately hides ~/.config/gh from generic Read/Bash
    # access; `gh` itself is the sole scoped exception in settings.json. Failing
    # here avoids making every dev/review session rediscover the same auth issue
    # and repeatedly ask the user to log in.
    if ! env GH_PROMPT_DISABLED=1 gh api user --jq .login </dev/null >/dev/null 2>&1; then
        echo "GitHub CLI is not authenticated or its active token is invalid." >&2
        echo "Run once on the host: gh auth login; gh auth refresh -s repo -s project -s read:project" >&2
        exit 1
    fi

    # resolve_conflicts() rebases, so one conflict can resurface on every replayed
    # commit. rerere replays a resolution already given for an identical conflict,
    # which is what keeps that cost bounded. Enabled here rather than left to a
    # manual step, so a freshly cloned project gets it too — and --local, so the
    # operator's global git config is never touched. Worktrees share this config.
    git -C "$REPO_ROOT" config --local rerere.enabled true 2>/dev/null || true
    git -C "$REPO_ROOT" config --local rerere.autoUpdate true 2>/dev/null || true

    # Self-heal: a previous run can leave the main tree off-base (a doc-pass
    # early return before its trailing checkout was one such case, fixed
    # above, but this catches any other way that could happen too — nothing
    # else in this script ever forces a return to base). Without this, a
    # single such incident strands every future run on the wrong branch
    # indefinitely, silently — observed 2026-08-09: 19+ hours, dozens of runs.
    local current_branch; current_branch="$(git -C "$REPO_ROOT" branch --show-current 2>/dev/null)"
    if [ -n "$current_branch" ] && [ "$current_branch" != "$SHIPYARD_BASE" ]; then
        log "main tree was left on '$current_branch' by a previous run — returning to $SHIPYARD_BASE"
        ( cd "$REPO_ROOT" && git checkout -q "$SHIPYARD_BASE" ) 2>/dev/null \
            || log "WARN: could not return to $SHIPYARD_BASE — inspect $REPO_ROOT by hand"
    fi

    # Ramasse ce qu'un run tué (SIGKILL, timeout systemd, reboot) n'a pas pu
    # nettoyer lui-même : les chemins de sortie normaux suppriment déjà leur
    # worktree, mais rien ne couvre une mort brutale, et .worktrees/ grossit
    # alors sans borne (arbre complet du dépôt + dépendances par worktree).
    # Ne touche jamais à un worktree porteur de travail non poussé — cf. le
    # script. Non fatal : une purge en échec ne doit pas empêcher de livrer.
    "$REPO_ROOT/.project/loop/purge-worktrees.sh" --quiet \
        || log "purge des worktrees/branches non effectuée (non-fatal)"

    log "shipyard loop: base=$SHIPYARD_BASE max_iters=$MAX_ITERS parallelism=$SHIPYARD_PARALLELISM"
    [ -n "${SHIPYARD_FALLBACK_API_KEY:-}" ] && log "API-key fallback: armed (used only if Max is rate-limited)"
    if [ "$SHIPYARD_PARALLELISM" -gt 1 ] && ! command -v flock >/dev/null 2>&1; then
        log "WARN: SHIPYARD_PARALLELISM>1 but flock is missing — falling back to sequential (unsafe otherwise)"
        SHIPYARD_PARALLELISM=1
    fi
    # Per-run ledger: process_issue_review/escalate append merged/escalated rows here; the
    # end-of-run retrospective reads it. Kept for the whole run (recovery included).
    RUN_LEDGER="$(mktemp)"; trap 'rm -f "$RUN_LEDGER"' EXIT
    if ! ticket_init; then
        _state_set '.loop.status="blocked" | .loop.paused_reason="project-sync" | .loop.current_issue=null'
        shipyard_notify "🚧 Boucle bloquée — impossible de lire le Project v2 / Sprint"
        return 1
    fi
    _state_set '.loop.status="running" | .loop.paused_reason=null | .loop.resume_after=null'
    # Board/label drift first: reconcile_out_of_band() below decides what is still
    # blocked by reading the labels, and recover_in_flight() reads the board. Both
    # need the two to agree, so import any hand edit before either of them runs.
    ticket_reconcile_drift
    reconcile_out_of_band
    # Operator entry point (`/deliver triage`): re-judge the blocked queue and stop.
    # It returns BEFORE recover_in_flight on purpose — this is the one invocation
    # meant to be run by hand while a scheduled run may already be in flight, and
    # recovering that run's in-progress issue here would put two processes on the
    # same branch. Triage itself is safe alongside: it only touches blocked issues,
    # which by definition no phase is working on.
    if [ "${SHIPYARD_TRIAGE_ONLY:-0}" = 1 ]; then
        triage_blocked_issues
        log "triage-only: file de travail non tirée, aucune reprise en vol"
        _state_set '.loop.current_issue=null'
        return 0
    fi
    recover_in_flight
    # Before asking for work: fold any open Dependabot alert into the board, so a
    # vulnerability is queued alongside feature work instead of waiting for a human
    # to notice it. Runs after ticket_init — it needs the resolved tracker.
    ticket_sync_external
    # Phase 0 — re-judge the blocked queue BEFORE asking for work. Order matters
    # twice over: an issue triage releases must be visible to ticket_next_todo() and
    # to review_scan_issues() in this same run (that is the whole point — a chain
    # head released here is delivered here), and the drained-sprint check below
    # must not advance past a Sprint that triage just refilled.
    triage_blocked_issues
    # A previous run may have paused immediately after completing the final item
    # of a Sprint. On resume, advance before asking for work so that checkpoint
    # cannot strand the loop on an already-drained iteration.
    if ticket_has_sprints && [ -z "$(ticket_next_todo)" ]; then
        ticket_advance_if_drained || true
    fi
    local iter=0 issue
    while [ "$iter" -lt "$MAX_ITERS" ]; do
        # /deliver pause writes this status asynchronously. Honour it only at
        # iteration boundaries so an in-flight issue reaches a consistent state.
        if loop_is_paused; then
            log "manual pause observed between iterations"
            break
        fi
        # Throttle: with parallelism, wait for a free worker slot before pulling more.
        if [ "$SHIPYARD_PARALLELISM" -gt 1 ]; then
            while [ "$(jobs -rp | wc -l)" -ge "$SHIPYARD_PARALLELISM" ]; do
                wait -n 2>/dev/null || sleep 1
            done
        fi
        issue="$(ticket_next_todo)"
        if [ -z "$issue" ]; then
            log "queue empty — nothing left in $SHIPYARD_TODO_LABEL"
            break
        fi
        iter=$((iter + 1))
        if [ "$SHIPYARD_PARALLELISM" -gt 1 ]; then
            # Claim the issue synchronously (todo→wip) BEFORE backgrounding so the next
            # ticket_next_todo can't hand the same issue to a second worker.
            ticket_set_status "$issue" "$SHIPYARD_TODO_LABEL" "$SHIPYARD_WIP_LABEL"
            ( process_issue_dev "$issue" || log "issue #$issue did not merge (see above)" ) &
        else
            process_issue_dev "$issue" || log "issue #$issue did not merge (see above)"
        fi
    done
    [ "$SHIPYARD_PARALLELISM" -gt 1 ] && wait   # drain in-flight dev workers
    [ "$iter" -ge "$MAX_ITERS" ] && log "iteration cap reached ($MAX_ITERS)"
    log "dev phase finished after $iter iteration(s)"

    # ── Review phase: judge/merge whatever the dev phase (this run's or a
    # previous one's) left in status:in-review. Sequential on purpose — merges
    # are already serialized by .merge.lock, but running reviews themselves in
    # parallel is a second axis of concurrency this change does not take on.
    local review_iter=0
    if ! loop_is_paused; then
        local rn
        for rn in $(review_scan_issues); do
            if loop_is_paused; then
                log "manual pause observed before review phase completed"
                break
            fi
            if [ "$review_iter" -ge "$MAX_REVIEW_ISSUES_PER_RUN" ]; then
                log "review iteration cap reached ($MAX_REVIEW_ISSUES_PER_RUN)"
                break
            fi
            review_iter=$((review_iter + 1))
            process_issue_review "$rn" || log "issue #$rn did not merge in review phase (see above)"
        done
        log "review phase finished after $review_iter issue(s)"
    fi

    local total=$((iter + review_iter))
    # A manual pause is durable: leave the loop paused so /deliver status reports
    # the truth. /deliver resume starts a new run, which clears the pause metadata.
    if loop_is_paused; then
        _state_set '.loop.current_issue=null'
        shipyard_notify "⏸️ Boucle en pause manuelle après $total itération(s) (dev: $iter, review: $review_iter)"
        return 0
    fi
    # Sprint drained (or cap hit) with real work done → auto retrospective. This
    # runs BEFORE the final idle checkpoint on purpose: sprint_retrospective calls
    # claude_invoke, whose success checkpoint flips status back to "running", so
    # idle must be the last write to leave a correct terminal state.
    if [ "$total" -gt 0 ] && [ "${SHIPYARD_RETRO:-1}" != 0 ]; then
        sprint_retrospective || log "retrospective step failed (non-fatal)"
    fi
    # Sprint drained → consolidate the whole documentation suite in its own PR.
    if [ "$total" -gt 0 ]; then
        doc_sprint_pass || log "sprint documentation pass failed (non-fatal)"
    fi
    if [ "$total" -gt 0 ]; then
        ticket_advance_if_drained || true
    fi
    # Preserve a terminal blocker instead of masking it as idle. A later run will
    # set running again after the human has returned the issue to status:todo.
    if jq -e '.loop.status == "blocked"' "$STATE" >/dev/null 2>&1; then
        _state_set '.loop.current_issue=null'
    else
        _state_set '.loop.status="idle" | .loop.current_issue=null'
    fi
    local unblocked; unblocked="$(grep -c '^unblocked' "$RUN_LEDGER" 2>/dev/null || true)"
    shipyard_notify "🏁 Boucle terminée — $total itération(s) (dev: $iter, review: $review_iter, blocages levés: ${unblocked:-0})"
}

if [ "${SHIPYARD_SOURCE_ONLY:-0}" != 1 ]; then
    main "$@"
fi
