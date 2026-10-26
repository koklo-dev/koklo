#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ticket-backend.sh — where the delivery loop's tickets live.
#
# Sourced by agent-loop.sh. Every read and write the loop performs against its
# TICKET TRACKER goes through the `ticket_*` contract defined here; the loop
# itself no longer knows what a GitHub issue is.
#
# WHY THIS EXISTS
#   The loop had `gh issue` and `gh project` calls spread across thirty sites,
#   so the tracker was not a choice — it was the control flow. A project that
#   wants its backlog somewhere else (the Obsidian vault the operator already
#   reads, typically) could not keep the loop: dev, review rounds, CI gating and
#   merge are entirely independent of where the ticket is written down, but they
#   were welded to it all the same.
#
# WHAT IS *NOT* HERE
#   Pull requests, CI, merges, branches, worktrees. Those stay on GitHub in
#   every backend and remain in agent-loop.sh. This file is the TRACKER only:
#   the queue, the statuses, the ticket text, the escalation conversation.
#
# CONTRACT
#   Selected by `.loop.tickets` in state.json, overridable with SHIPYARD_TICKETS.
#   A backend `X` implements every `_ticket_X_<op>` below; `ticket_<op>` is a
#   thin dispatcher, so adding a backend adds functions and edits none.
#
#   Identity
#     ticket_ref <id>                      human-facing reference ("#12")
#     ticket_slug <id>                     branch/worktree-safe form of <id>
#     ticket_sort                          stdin filter: dedupe + order a list
#     ticket_trailer <id> <pr-body>        closing trailer for a PR body
#   Queue
#     ticket_init                          prepare the backend; rc 1 = unusable
#     ticket_list_in_status <status>       ids in that status, current sprint
#     ticket_scan_in_status <status>       widened scan (see below)
#     ticket_next_todo                     the next id to develop, or empty
#     ticket_set_status <id> <rm> <add>    phase transition
#     ticket_set_status_exclusive <id> <add>  repair: exactly one status
#     ticket_reconcile_drift               re-import out-of-band human edits
#     ticket_has_sprints                   rc 0 when the backend has a sprint
#                                          sequence to advance through at all
#     ticket_advance_if_drained            move to the next sprint; rc 1 = none
#     ticket_adopt <id>                    pull an old ticket into this sprint
#     ticket_sync_external                 fold outside sources (security alerts)
#                                          into the queue; no-op when unavailable
#   Content
#     ticket_meta <id>                     {state,stateReason,title,labels[]}
#     ticket_labels <id>                   JSON array of label names
#     ticket_title_body <id>               "title\n\nbody"
#     ticket_context <id>                  the prompt block for an agent
#     ticket_closing_pr <id>               PR number that closed it, or empty
#     ticket_comments_count <id> [fb]      conversation length
#     ticket_replies_after <id> <marker>   replies posted after <marker>
#     ticket_find_open_by_title <phrase>   id of an open ticket, or empty
#     ticket_extract_refs <text>           ids this text cites, one per line
#   Write
#     ticket_comment <id> <body>
#     ticket_close <id> <completed|not planned>
#     ticket_finalize <id> [from-label]    board Done + drop label + close
#     ticket_create <title> <body-file> <label>
#     ticket_ensure_label <name> <color> <description>
#
#   `status` is always one of the four BOARD names — Todo, In Progress,
#   In Review, Blocked — never a label, with Done as the terminal state. The
#   `status:*` LABELS that still appear in ticket_set_status's signature are the
#   loop's own vocabulary for a transition; each backend maps them to whatever
#   it actually stores.
#
# BACKENDS
#   github  issues for the tickets, Project v2 for the board (the default).
#   vault   the Obsidian sprint files are the tracker; pull requests, CI and
#           merges stay on GitHub. See the vault section for its conventions.
#
#   `ticket_scan_in_status` is deliberately wider than `ticket_list_in_status`:
#   the review and triage queues are the two where missing a row is
#   unrecoverable (an issue that left the dev phase with a PR open and nobody
#   scheduled to merge it), so they union every source the backend has. Every
#   other queue can afford to miss a row — the next run picks it up.
# ─────────────────────────────────────────────────────────────────────────────

# ── Backend selection ────────────────────────────────────────────────────────
# Env wins over state so an operator can try a backend for one run without
# editing a file the loop also writes to. An unknown name is fatal rather than
# silently falling back: delivering against the wrong tracker would move real
# work to a queue nobody is reading.
TICKET_BACKEND="${SHIPYARD_TICKETS:-$(jq -r '.loop.tickets // "github"' "$STATE" 2>/dev/null || echo github)}"
case "$TICKET_BACKEND" in
    github|vault) ;;
    *) echo "ticket-backend: unknown backend '$TICKET_BACKEND' (expected: github, vault)" >&2; exit 2 ;;
esac
# Downstream helpers (vault-task-status.sh) branch on this too, and they are run
# as separate processes rather than sourced.
export SHIPYARD_TICKETS="$TICKET_BACKEND"

ticket_backend_name() { printf '%s' "$TICKET_BACKEND"; }

# ── Dispatchers ──────────────────────────────────────────────────────────────
ticket_ref()                   { "_ticket_${TICKET_BACKEND}_ref" "$@"; }
ticket_slug()                  { "_ticket_${TICKET_BACKEND}_slug" "$@"; }
ticket_sort()                  { "_ticket_${TICKET_BACKEND}_sort" "$@"; }
ticket_trailer()               { "_ticket_${TICKET_BACKEND}_trailer" "$@"; }
ticket_init()                  { "_ticket_${TICKET_BACKEND}_init" "$@"; }
ticket_list_in_status()        { "_ticket_${TICKET_BACKEND}_list_in_status" "$@"; }
ticket_scan_in_status()        { "_ticket_${TICKET_BACKEND}_scan_in_status" "$@"; }
ticket_next_todo()             { "_ticket_${TICKET_BACKEND}_next_todo" "$@"; }
ticket_set_status()            { "_ticket_${TICKET_BACKEND}_set_status" "$@"; }
ticket_set_status_exclusive()  { "_ticket_${TICKET_BACKEND}_set_status_exclusive" "$@"; }
ticket_reconcile_drift()       { "_ticket_${TICKET_BACKEND}_reconcile_drift" "$@"; }
ticket_has_sprints()           { "_ticket_${TICKET_BACKEND}_has_sprints" "$@"; }
ticket_advance_if_drained()    { "_ticket_${TICKET_BACKEND}_advance_if_drained" "$@"; }
ticket_adopt()                 { "_ticket_${TICKET_BACKEND}_adopt" "$@"; }
ticket_sync_external()         { "_ticket_${TICKET_BACKEND}_sync_external" "$@"; }
ticket_meta()                  { "_ticket_${TICKET_BACKEND}_meta" "$@"; }
ticket_labels()                { "_ticket_${TICKET_BACKEND}_labels" "$@"; }
ticket_title_body()            { "_ticket_${TICKET_BACKEND}_title_body" "$@"; }
ticket_context()               { "_ticket_${TICKET_BACKEND}_context" "$@"; }
ticket_closing_pr()            { "_ticket_${TICKET_BACKEND}_closing_pr" "$@"; }
ticket_comments_count()        { "_ticket_${TICKET_BACKEND}_comments_count" "$@"; }
ticket_replies_after()         { "_ticket_${TICKET_BACKEND}_replies_after" "$@"; }
ticket_find_open_by_title()    { "_ticket_${TICKET_BACKEND}_find_open_by_title" "$@"; }
ticket_extract_refs()          { "_ticket_${TICKET_BACKEND}_extract_refs" "$@"; }
ticket_comment()               { "_ticket_${TICKET_BACKEND}_comment" "$@"; }
ticket_close()                 { "_ticket_${TICKET_BACKEND}_close" "$@"; }
ticket_finalize()              { "_ticket_${TICKET_BACKEND}_finalize" "$@"; }
ticket_create()                { "_ticket_${TICKET_BACKEND}_create" "$@"; }
ticket_ensure_label()          { "_ticket_${TICKET_BACKEND}_ensure_label" "$@"; }

# ═════════════════════════════════════════════════════════════════════════════
# GitHub backend — issues for the tickets, Project v2 for the board.
#
# STATUS MODEL (unchanged, moved here verbatim)
#   Project v2 configured: current Sprint iteration + Status are authoritative.
#   No board configured: issue labels remain the backward-compatible queue.
#   Labels are still mirrored in Project mode so older automations keep working.
# ═════════════════════════════════════════════════════════════════════════════

_ticket_github_ref()  { printf '#%s' "$1"; }
_ticket_github_slug() { printf '%s' "$1"; }
# Issue numbers are numbers: ordering them as strings would put #10 before #9.
_ticket_github_sort() { sort -n -u; }

# Project mode is enabled by state.json.loop.board_id. The repository owner is
# the default board owner; loop.board_owner can override it for cross-owner boards.
PROJECT_ENABLED=0
PROJECT_NUMBER=""
PROJECT_OWNER=""
PROJECT_ID=""
PROJECT_STATUS_FIELD=""
PROJECT_SPRINT_FIELD=""
PROJECT_FIELDS=""
PROJECT_ITERATIONS=""
PROJECT_ITEMS_CACHE=""

project_items() {
    [ -n "$PROJECT_ITEMS_CACHE" ] || return 1
    printf '%s\n' "$PROJECT_ITEMS_CACHE"
}

project_refresh_items() {
    PROJECT_ITEMS_CACHE="$(gh project item-list "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" \
        --format json --limit "$SHIPYARD_PROJECT_LIMIT" 2>/dev/null || true)"
    jq -e '.items | arrays' <<<"$PROJECT_ITEMS_CACHE" >/dev/null 2>&1
}

project_materialize_iteration() { # <iteration-title> <ordinal>
    [ "${SHIPYARD_VAULT_PROJECTION:-1}" != 0 ] || return 0
    local title="$1" ordinal="$2" vault sprints file helper
    vault="$(jq -r '.vault_project_path // empty' "$STATE" 2>/dev/null || true)"
    if [ -n "$vault" ]; then sprints="$vault/sprints"; else sprints="$REPO_ROOT/.project/sprints"; fi
    file="$sprints/sprint-$(printf '%03d' "$ordinal").md"
    [ -f "$file" ] || return 0
    helper="$LOOP_DIR/materialize-sprint-issues.sh"
    [ -x "$helper" ] || { log "vault projection helper missing: $helper"; return 1; }
    if "$helper" "$PROJECT_NUMBER" "$PROJECT_OWNER" "$file" "$title"; then
        project_refresh_items || { log "Project items unavailable after vault projection"; return 1; }
    else
        log "vault projection failed for $title"
        return 1
    fi
}

# Sprints exist only on a Project board. Label-only mode is one flat queue, so
# there is nothing to advance to and the drained check must not even be asked.
_ticket_github_has_sprints() { [ "$PROJECT_ENABLED" = 1 ]; }

# Dependabot alerts live outside the board, so the loop — which only ever pulls
# Project items in Todo — could never see them. Project each vulnerable package
# onto the current Sprint as an ordinary issue, once per run, before work starts.
: "${SHIPYARD_SECURITY_SYNC:=1}"
_ticket_github_sync_external() {
    [ "$PROJECT_ENABLED" = 1 ] || return 0
    [ "${SHIPYARD_SECURITY_SYNC}" != 0 ] || return 0
    local helper="$LOOP_DIR/security-alerts-to-issues.sh"
    [ -x "$helper" ] || { log "security sync helper missing: $helper"; return 0; }
    # Never fatal: a missing security_events scope or a GitHub hiccup must not
    # stop delivery. The helper logs its own reason and exits 0 when unavailable.
    if "$helper" "$PROJECT_NUMBER" "$PROJECT_OWNER"; then
        project_refresh_items || log "Project items unavailable after security sync"
    else
        log "security alert sync failed — continuing without it"
    fi
    return 0
}

project_set_current_iteration() { # <iteration-json> <ordinal>
    local value="$1" ordinal="$2" id title start duration tmp="$STATE.tmp.$$"
    id="$(jq -r '.id' <<<"$value")"; title="$(jq -r '.title' <<<"$value")"
    start="$(jq -r '.startDate' <<<"$value")"; duration="$(jq -r '.duration' <<<"$value")"
    jq --arg id "$id" --arg title "$title" --arg start "$start" --argjson duration "$duration" \
       --argjson sprint "$ordinal" \
       '.loop.current_iteration={id:$id,title:$title,start_date:$start,duration:$duration}
        | .current_sprint=$sprint' "$STATE" >"$tmp" && mv "$tmp" "$STATE"
    log "project sprint selected: $title ($start, ${duration}d)"
}

project_iteration_has_todo() { # <title>
    local title="$1" slug
    slug="$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null || true)"
    project_items | jq -e --arg sprint "$title" --arg slug "$slug" '
      any(.items[]?;
        .content.type == "Issue" and .content.repository == $slug and
        .status == "Todo" and ((.sprint.title // .sprint) == $sprint))' >/dev/null 2>&1
}

_ticket_github_init() {
    PROJECT_NUMBER="$(jq -r '.loop.board_id // empty' "$STATE")"
    [ -n "$PROJECT_NUMBER" ] || return 0
    PROJECT_OWNER="$(jq -r '.loop.board_owner // empty' "$STATE")"
    [ -n "$PROJECT_OWNER" ] || PROJECT_OWNER="$(gh repo view --json owner --jq .owner.login 2>/dev/null || true)"
    [ -n "$PROJECT_OWNER" ] || { log "Project v2: cannot resolve board owner"; return 1; }
    PROJECT_ID="$(gh project view "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --format json --jq .id 2>/dev/null || true)"
    [ -n "$PROJECT_ID" ] || { log "Project v2 #$PROJECT_NUMBER is unavailable (check project/read:project scopes)"; return 1; }
    PROJECT_FIELDS="$(gh project field-list "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --format json --limit 100 2>/dev/null || true)"
    PROJECT_STATUS_FIELD="$(jq -r '.fields[]? | select(.name=="Status") | .id' <<<"$PROJECT_FIELDS" | head -1)"
    PROJECT_SPRINT_FIELD="$(jq -r '.fields[]? | select(.name=="Sprint") | .id' <<<"$PROJECT_FIELDS" | head -1)"
    [ -n "$PROJECT_STATUS_FIELD" ] && [ -n "$PROJECT_SPRINT_FIELD" ] || {
        log "Project v2 requires the Status and Sprint fields"; return 1; }
    PROJECT_ITERATIONS="$(gh api graphql -f query='query($id:ID!){node(id:$id){... on ProjectV2{field(name:"Sprint"){... on ProjectV2IterationField{configuration{iterations{id title startDate duration} completedIterations{id title startDate duration}}}}}}}' \
        -f id="$PROJECT_ID" --jq '.data.node.field.configuration | [.completedIterations[],.iterations[]] | unique_by(.id) | sort_by(.startDate)' 2>/dev/null || true)"
    [ "$(jq -r 'length' <<<"${PROJECT_ITERATIONS:-[]}" 2>/dev/null || echo 0)" -gt 0 ] || {
        log "Project v2 Sprint field has no iterations"; return 1; }
    PROJECT_ENABLED=1
    # One authoritative snapshot per loop invocation. Re-fetching the complete
    # Project for every status transition burns GraphQL points quickly on large
    # boards; project_set_status mutates this cache after each successful edit.
    project_refresh_items || {
        log "Project v2 items are unavailable (rate limit or project/read:project scope)"; return 1; }

    local saved today selected ordinal=1 row i=0
    saved="$(jq -r '.loop.current_iteration.id // empty' "$STATE")"
    today="$(date +%F)"
    selected="$(jq -c --arg id "$saved" 'if $id=="" then empty else .[] | select(.id==$id) end' <<<"$PROJECT_ITERATIONS" | head -1)"
    if [ -z "$selected" ]; then
        selected="$(jq -c --arg today "$today" '.[] | select(.startDate <= $today) | select(((.startDate | strptime("%Y-%m-%d") | mktime) + (.duration*86400)) > ($today | strptime("%Y-%m-%d") | mktime))' <<<"$PROJECT_ITERATIONS" 2>/dev/null | head -1)"
    fi
    if [ -z "$selected" ]; then
        while IFS= read -r row; do
            if project_iteration_has_todo "$(jq -r .title <<<"$row")"; then selected="$row"; break; fi
        done < <(jq -c '.[]' <<<"$PROJECT_ITERATIONS")
    fi
    [ -n "$selected" ] || selected="$(jq -c '.[0]' <<<"$PROJECT_ITERATIONS")"
    while IFS= read -r row; do
        i=$((i + 1)); [ "$(jq -r .id <<<"$row")" = "$(jq -r .id <<<"$selected")" ] && { ordinal="$i"; break; }
    done < <(jq -c '.[]' <<<"$PROJECT_ITERATIONS")
    project_set_current_iteration "$selected" "$ordinal"
    project_materialize_iteration "$(jq -r .title <<<"$selected")" "$ordinal" || return 1
}

project_item_id() { # <issue>
    local n="$1" slug
    slug="$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null || true)"
    project_items | jq -r --argjson n "$n" --arg slug "$slug" \
      '.items[]? | select(.content.type=="Issue" and .content.number==$n and .content.repository==$slug) | .id' | head -1
}

project_set_status() { # <issue> <Todo|In Progress|In Review|Done|Blocked>
    [ "$PROJECT_ENABLED" = 1 ] || return 0
    local n="$1" target="$2" item option
    item="$(project_item_id "$n")"
    option="$(jq -r --arg name "$target" '.fields[]? | select(.name=="Status") | .options[]? | select(.name==$name) | .id' <<<"$PROJECT_FIELDS" | head -1)"
    [ -n "$item" ] && [ -n "$option" ] || { log "Project v2: cannot set #$n to '$target'"; return 1; }
    gh project item-edit --id "$item" --project-id "$PROJECT_ID" --field-id "$PROJECT_STATUS_FIELD" \
        --single-select-option-id "$option" >/dev/null 2>&1 || return 1
    PROJECT_ITEMS_CACHE="$(jq --arg id "$item" --arg status "$target" \
      '(.items[] | select(.id==$id) | .status) = $status' <<<"$PROJECT_ITEMS_CACHE")"
}

_ticket_github_advance_if_drained() {
    [ "$PROJECT_ENABLED" = 1 ] || return 1
    local current current_pos next row pos=0
    current="$(jq -r '.loop.current_iteration.id // empty' "$STATE")"
    current_pos="$(jq -r --arg id "$current" 'to_entries[] | select(.value.id==$id) | .key' <<<"$PROJECT_ITERATIONS" | head -1)"
    [ -n "$current_pos" ] || return 1
    # Drained means "no Todo left", which includes sprints that ended with blocked
    # issues. Record it so completed_sprints reflects what the loop actually left
    # behind rather than staying empty forever. Re-checking the board here matters:
    # a run stopped by the iteration cap still reaches this function with work left.
    if ! project_iteration_has_todo "$(jq -r '.loop.current_iteration.title // empty' "$STATE")"; then
        _state_set ".completed_sprints = ((.completed_sprints // []) + [$((current_pos + 1))] | unique)" || true
    fi
    while IFS= read -r row; do
        pos=$((pos + 1))
        [ "$pos" -le "$((current_pos + 1))" ] && continue
        project_materialize_iteration "$(jq -r .title <<<"$row")" "$pos" || return 1
        if project_iteration_has_todo "$(jq -r .title <<<"$row")"; then
            next="$row"
            project_set_current_iteration "$next" "$pos"
            shipyard_notify "⏭️ Sprint suivant prêt — $(jq -r .title <<<"$next")"
            return 0
        fi
    done < <(jq -c '.[]' <<<"$PROJECT_ITERATIONS")
    log "project sprint drained — no later Sprint with Todo items"
    return 1
}

# ── Issue status: ONE source of truth ────────────────────────────────────────
# The board's Status field is authoritative for "which phase owns this issue".
# The status:* labels are a human-facing MIRROR of it, kept in sync by
# _ticket_github_set_status() and re-imported by _ticket_github_reconcile_drift()
# when a human edits one by hand.
#
# This used to be split: the todo query read the board Status field while the
# review scan and the startup recovery read the labels. The two drift the moment
# anything touches only one of them — an escalation that half-applied, a human
# removing status:blocked from the issue page — and an issue that lands in
# board=Todo with no review label is then picked up by the dev phase forever while
# staying invisible to the review phase. The work was already pushed, so every dev
# pass produced an empty diff and re-escalated "no-output", and the conflict
# resolver was never reached. Every read now goes through ticket_list_in_status().
status_label_for() {  # status_label_for <Todo|In Progress|In Review|Blocked>
    case "$1" in
        "Todo")        printf '%s' "$SHIPYARD_TODO_LABEL" ;;
        "In Progress") printf '%s' "$SHIPYARD_WIP_LABEL" ;;
        "In Review")   printf '%s' "$SHIPYARD_REVIEW_LABEL" ;;
        "Blocked")     printf '%s' "$SHIPYARD_BLOCKED_LABEL" ;;
    esac
}

board_status_for() {  # board_status_for <status label>
    case "$1" in
        "$SHIPYARD_TODO_LABEL")    printf 'Todo' ;;
        "$SHIPYARD_WIP_LABEL")     printf 'In Progress' ;;
        "$SHIPYARD_REVIEW_LABEL")  printf 'In Review' ;;
        "$SHIPYARD_BLOCKED_LABEL") printf 'Blocked' ;;
    esac
}

_ticket_github_list_in_status() {  # <board-status> → sorted issue numbers
    local target="$1" sprint slug
    if [ "$PROJECT_ENABLED" = 1 ]; then
        sprint="$(jq -r '.loop.current_iteration.title // empty' "$STATE")"
        slug="$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null || true)"
        project_items | jq -r --arg status "$target" --arg sprint "$sprint" --arg slug "$slug" '
          [.items[]? | select(.content.type=="Issue" and .content.repository==$slug and
            .status==$status and ((.sprint.title // .sprint)==$sprint)) | .content.number] | sort | .[]'
        return
    fi
    gh issue list --state open --label "$(status_label_for "$target")" \
        --json number --jq 'sort_by(.number) | .[].number' 2>/dev/null
}

# Union of the board and its mirror label. Blocked issues are scanned across the
# WHOLE repository, not just the current Sprint's board items: a blocker outlives
# the iteration that raised it — a Sprint advances even when it ends with blocked
# work — so a board-only scan would leave exactly the oldest, most stale
# escalations unexamined forever. The review queue unions for a different reason:
# the dev phase hands an issue over by writing both the board and the label, and
# the board is read from a cache that is never re-fetched mid-run — any staleness
# there and the issue is silently dropped with its PR open and nobody scheduled to
# merge it. A union can only ever add rows, never hide one.
_ticket_github_scan_in_status() {  # <board-status>
    local target="$1" label; label="$(status_label_for "$target")"
    local -a extra=()
    # Only the blocked scan pays for the repository-wide limit; the review scan
    # keeps gh's default page, exactly as each queue did before.
    [ "$target" = "Blocked" ] && extra=(--limit "$SHIPYARD_PROJECT_LIMIT")
    { _ticket_github_list_in_status "$target"
      [ "$PROJECT_ENABLED" = 1 ] && gh issue list --state open --label "$label" \
          "${extra[@]}" --json number --jq '.[].number' 2>/dev/null
    } | _ticket_github_sort
}

_ticket_github_next_todo() { _ticket_github_list_in_status "Todo" | head -1; }

_ticket_github_set_status() {  # <issue> <remove-label> <add-label>
    local n="$1" rm="$2" add="$3"
    # Only the label the caller names is removed. Blanket-removing every other
    # status label looks tidier, but it makes every transition carry
    # --remove-label status:todo — indistinguishable from claiming the issue —
    # and duplicates are repaired by reconcile_drift() on the next run.
    gh issue edit "$n" --remove-label "$rm" --add-label "$add" >/dev/null 2>&1 || \
        gh issue edit "$n" --add-label "$add" >/dev/null 2>&1 || true
    case "$add" in
        "$SHIPYARD_TODO_LABEL")    project_set_status "$n" "Todo" || true ;;
        "$SHIPYARD_WIP_LABEL")     project_set_status "$n" "In Progress" || true ;;
        "$SHIPYARD_REVIEW_LABEL")  project_set_status "$n" "In Review" || true ;;
        "$SHIPYARD_BLOCKED_LABEL") project_set_status "$n" "Blocked" || true ;;
    esac
}

# Exactly one status label, plus the board. set_status() only ever removes the
# label its caller names — right for a phase transition, wrong here: triage is the
# place where a drifting mirror (blocked AND in-progress, from a half-applied
# escalation) has to be repaired, not propagated.
_ticket_github_set_status_exclusive() {  # <issue> <add-label>
    local n="$1" add="$2" l board; local -a args=()
    for l in "$SHIPYARD_TODO_LABEL" "$SHIPYARD_WIP_LABEL" "$SHIPYARD_REVIEW_LABEL" "$SHIPYARD_BLOCKED_LABEL"; do
        [ "$l" = "$add" ] || args+=(--remove-label "$l")
    done
    gh issue edit "$n" "${args[@]}" --add-label "$add" >/dev/null 2>&1 \
        || gh issue edit "$n" --add-label "$add" >/dev/null 2>&1 || true
    board="$(board_status_for "$add")"
    [ -n "$board" ] && { project_set_status "$n" "$board" || true; }
    return 0
}

# The escalation comment asks the human to restore a LABEL — that is the only
# control the issue page offers — but the queues read the board. Import that edit
# here, once per run, before any queue is read, so a hand-unblocked issue actually
# restarts. Repairs the mirror the other way too: an issue left with no status
# label at all gets its label back from the board. Label wins on a genuine
# disagreement — it is the deliberate human act; the board wins when the labels
# are absent or ambiguous.
_ticket_github_reconcile_drift() {
    [ "$PROJECT_ENABLED" = 1 ] || return 0
    local sprint slug labelled n board want have count
    sprint="$(jq -r '.loop.current_iteration.title // empty' "$STATE")"
    slug="$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null || true)"
    labelled="$(gh issue list --state open --limit "$SHIPYARD_PROJECT_LIMIT" \
        --json number,labels 2>/dev/null || echo '[]')"
    # This one fetch is also the open/closed oracle: the board carries no such
    # flag, so an issue absent from it is closed and must not be touched. Bail out
    # rather than guess if the response is not the array we asked for — writing a
    # status label based on a misread would be worse than skipping the repair.
    jq -e 'arrays' <<<"$labelled" >/dev/null 2>&1 || return 0
    while IFS=$'\t' read -r n board; do
        [ -n "$n" ] || continue
        jq -e --argjson n "$n" 'any(.[]; .number==$n)' <<<"$labelled" >/dev/null 2>&1 || continue
        have="$(jq -r --argjson n "$n" \
            --arg todo "$SHIPYARD_TODO_LABEL" --arg wip "$SHIPYARD_WIP_LABEL" \
            --arg rev "$SHIPYARD_REVIEW_LABEL" --arg blk "$SHIPYARD_BLOCKED_LABEL" '
            .[] | select(.number==$n) | [.labels[].name]
            | map(select(. == $todo or . == $wip or . == $rev or . == $blk)) | .[]' \
            <<<"$labelled" 2>/dev/null)"
        count="$(printf '%s' "$have" | grep -c . || true)"
        if [ "$count" = 1 ]; then
            want="$(board_status_for "$have")"
            [ -n "$want" ] && [ "$want" != "$board" ] || continue
            log "status drift #$n — label '$have' vs board '$board' → board := $want"
            project_set_status "$n" "$want" || log "status drift #$n — board update refused"
        else
            # No status label, or several: the board is the tie-breaker. Rewrite the
            # mirror from it so the next reconcile sees a single, agreeing label.
            want="$(status_label_for "$board")"
            [ -n "$want" ] || continue
            [ "$count" = 0 ] || log "status drift #$n — labels ambiguous ($count) → mirror rebuilt from board '$board'"
            [ "$count" = 0 ] && log "status drift #$n — no status label → mirror restored to '$want' from board"
            _ticket_github_set_status "$n" "" "$want"
        fi
    done < <(project_items | jq -r --arg sprint "$sprint" --arg slug "$slug" '
        .items[]? | select(.content.type=="Issue" and .content.repository==$slug and
          ((.sprint.title // .sprint)==$sprint))
        | "\(.content.number)\t\(.status // "")"')
    return 0
}

# Move an issue into the Sprint the loop is currently working on. Releasing a
# blocked issue is not enough on a Project board: the queues read only the CURRENT
# iteration, and a blocker outlives the Sprint that raised it — a Sprint advances
# even when it ends with blocked work. Without this, triage would hand an old
# issue back to a queue that structurally cannot see it, and it would sit in Todo
# forever. Best-effort: a board that refuses the edit leaves the label queue working.
_ticket_github_adopt() {  # <issue>
    [ "$PROJECT_ENABLED" = 1 ] || return 0
    local n="$1" item iter
    iter="$(jq -r '.loop.current_iteration.id // empty' "$STATE" 2>/dev/null || true)"
    [ -n "$iter" ] && [ -n "$PROJECT_SPRINT_FIELD" ] || return 0
    item="$(project_item_id "$n")"
    [ -n "$item" ] || return 0
    gh project item-edit --id "$item" --project-id "$PROJECT_ID" \
        --field-id "$PROJECT_SPRINT_FIELD" --iteration-id "$iter" >/dev/null 2>&1 \
        || { log "triage: #$n — Sprint courant non appliqué sur le board (non fatal)"; return 0; }
    log "triage: #$n rattachée au Sprint courant pour redevenir visible de la file"
    project_refresh_items >/dev/null 2>&1 || true
}

# ── Content ──────────────────────────────────────────────────────────────────
_ticket_github_meta() {  # <issue> → {state,stateReason,title,labels:[name]}
    gh issue view "$1" --json state,stateReason,title,labels 2>/dev/null
}

_ticket_github_labels() {  # <issue> → JSON array of label names
    gh issue view "$1" --json labels --jq '[.labels[].name]' 2>/dev/null || echo '[]'
}

_ticket_github_title_body() {  # <issue>
    gh issue view "$1" --json title,body --jq '"\(.title)\n\n\(.body)"' 2>/dev/null
}

_ticket_github_context() {  # <issue> → the prompt header block
    local n="$1"
    gh issue view "$n" --json number,title,body,labels \
        --template '## Issue #{{.number}} — {{.title}}

{{.body}}

Labels: {{range .labels}}{{.name}} {{end}}' 2>/dev/null || printf '## Issue #%s' "$n"
}

_ticket_github_closing_pr() {  # <issue> → the PR number that closed it
    gh issue view "$1" --json closedByPullRequestsReferences \
        --jq '[.closedByPullRequestsReferences[].number] | max // empty' 2>/dev/null || true
}

# How many comments the issue carries right now. The triage budget treats a NEW
# comment as "the human answered, re-judge" — so this has to be read AFTER a pass
# that comments, never before: escalate() posts one itself, and counting the
# loop's own comment as a human reply would reopen the budget every single run,
# defeating the silence it exists to enforce.
_ticket_github_comments_count() {  # <issue> [fallback]
    local n="$1" fallback="${2:-0}" c
    c="$(gh issue view "$n" --json comments --jq '(.comments // []) | length' 2>/dev/null || true)"
    [[ "$c" =~ ^[0-9]+$ ]] || c="$fallback"
    printf '%s' "$c"
}

# Exactly the slice that answers the escalation: the comments posted AFTER the
# last one carrying <marker>. Bounded by construction — a ticket that was never
# escalated contributes nothing, and a long loop-generated history before the
# escalation costs no tokens either.
_ticket_github_replies_after() {  # <issue> <marker>
    gh issue view "$1" --json comments 2>/dev/null \
        | jq -r --arg m "$2" '
            (.comments // []) as $c
            | ([$c | to_entries[] | select(.value.body | contains($m)) | .key] | last) as $i
            | (if $i == null then [] else $c[($i + 1):] end)
            | map("#### @\(.author.login // "?") — \(.createdAt)\n\n\(.body)")
            | join("\n\n")' 2>/dev/null
}

# NB: the phrase must be quoted inside the search string. Unquoted, "chore(retro):"
# and a lone digit break GitHub's search grammar and the query silently matches
# nothing — an idempotency check then always "passes" and a fresh duplicate issue
# gets opened every run (46 dupes observed on 2026-08-08).
_ticket_github_find_open_by_title() {  # <phrase> → id, or empty
    gh issue list --state open --search "\"$1\" in:title" \
        --json number --jq '.[0].number // empty' 2>/dev/null || true
}

# A dependency chain escalation ("#268 waits on #267 which waits on #266") is
# unfalsifiable from the text alone; resolving what it cites is what answers it.
# `#N` is GitHub's notation, so the pattern belongs to this backend.
_ticket_github_extract_refs() {  # <text> → ids, one per line
    grep -oE '#[0-9]+' <<<"$1" 2>/dev/null | tr -d '#' | _ticket_github_sort
}

# ── Write ────────────────────────────────────────────────────────────────────
_ticket_github_comment() {  # <issue> <body>
    gh issue comment "$1" --body "$2" >/dev/null 2>&1 || true
}

# Closing also retires the board row. A board left showing an issue that no
# longer exists is the same staleness the status mirror exists to prevent, and
# the only caller (triage closing a duplicate) always wanted both.
_ticket_github_close() {  # <issue> <completed|not planned>
    gh issue close "$1" --reason "$2" >/dev/null 2>&1 || true
    project_set_status "$1" "Done" || true
}

_ticket_github_finalize() {  # <issue> [from-label]
    local n="$1" from="${2:-}"
    project_set_status "$n" "Done" || true
    [ -n "$from" ] && { gh issue edit "$n" --remove-label "$from" >/dev/null 2>&1 || true; }
    gh issue close "$n" --reason completed >/dev/null 2>&1 || true
}

_ticket_github_ensure_label() {  # <name> <color> <description>
    gh label create "$1" --color "$2" --description "$3" >/dev/null 2>&1 || true
}

_ticket_github_create() {  # <title> <body-file> <label>
    gh issue create --title "$1" --label "$3" --body-file "$2" >/dev/null 2>&1
}

# The closing trailer in the PR body is what links the two and, on the default
# branch, what closes the ticket. `Closes #N` was once hard-coded in both the
# commit and the body, and SHIPYARD_BASE is usually the repository's default
# branch — so the issue closed the moment the PR landed, including when only part
# of its acceptance criteria had shipped. An agent that writes `Refs #N` in the
# body it hands back now gets that honoured, body and commit.
_ticket_github_trailer() {  # <issue> <pr-body>
    local n="$1"
    if grep -qiE "(^|[^[:alnum:]_])refs[[:space:]]+#$n([^0-9]|\$)" <<<"$2"; then
        printf 'Refs #%s' "$n"
    else
        printf 'Closes #%s' "$n"
    fi
}

# ═════════════════════════════════════════════════════════════════════════════
# Vault backend — the Obsidian sprint files ARE the tracker.
#
# WHY
#   The vault was already the source of truth: materialize-sprint-issues.sh
#   projected it INTO GitHub and vault-task-status.sh wrote the outcome back,
#   so every delivery state the loop produces was already legible there. This
#   backend drops the round trip and reads what it was already writing. The
#   operator's board becomes the queue, and GitHub keeps only what it is
#   genuinely good at: pull requests, CI and merges.
#
# THE DATA MODEL (unchanged — this is the format the vault already carries)
#   A first-level task line, optionally prefixed with a priority marker:
#       - [ ] 🔴 **[APP-013]** Habillage de l'onglet Suivi
#   Its single status line, indented, stamped with a machine marker:
#       ␣␣- Statut : 🟡 **en cours** · APP-013 · 2026-10-19 <!-- shipyard-status:APP-013 -->
#   The task BODY is everything between that task line and the next first-level
#   task or `##` heading — acceptance criteria included, which is precisely what
#   the materializer used to copy into an issue body.
#
#   board status  ⇄  vault
#     Todo          unchecked task, no badge
#     In Progress   🟡    In Review  🔵    Blocked  🔴    Done  ✅ / [x]
#
# WHAT HAD TO BE ADDED
#   One thing the vault had no place for: the escalation CONVERSATION. A ticket
#   note under <vault>/tickets/<ID>.md carries it — the loop appends its asks
#   there, the human answers in Obsidian, and ticket_replies_after() reads back
#   exactly what was written after the last ask. That is the whole of the
#   human-in-the-loop protocol, with no GitHub account involved.
#
# WRITES ARE SERIALIZED BY THE CALLER
#   agent-loop.sh already takes .project/.vault.lock around vault_task_status();
#   the status writer is reused as-is rather than reimplemented, so the careful
#   parts — idempotent replay, transition dating, the progress banner — have one
#   implementation, not two.
# ═════════════════════════════════════════════════════════════════════════════

: "${SHIPYARD_VAULT_TICKETS_DIR:=tickets}"

# An id names a branch and a worktree, so it has to survive as a path segment.
# Vault ids are conventionally [A-Z]+-[0-9]+, but nothing enforces that and a
# hand-written one with a slash or a space would otherwise create a branch
# somewhere unintended — or fail the run outright.
_ticket_vault_slug() { printf '%s' "$1" | tr -c 'A-Za-z0-9._-' '-' | sed -E 's/-+/-/g; s/^-|-$//g'; }
_ticket_vault_ref()  { printf '%s' "$1"; }
# Ids are strings here (APP-9, APP-10): numeric order would be meaningless and
# `sort -n` would collapse them all to 0. Lexicographic, so a run is at least
# reproducible.
_ticket_vault_sort() { sort -u; }

# No issue to close, so no closing keyword: the PR states which task it serves
# and the loop ticks the vault checkbox itself once the merge lands.
_ticket_vault_trailer() { printf 'Refs %s' "$1"; }

_vault_sprints_dir() {
    local vault; vault="$(jq -r '.vault_project_path // empty' "$STATE" 2>/dev/null || true)"
    if [ -n "$vault" ]; then printf '%s/sprints' "$vault"
    else printf '%s/.project/sprints' "$REPO_ROOT"; fi
}

_vault_tickets_dir() {
    local vault; vault="$(jq -r '.vault_project_path // empty' "$STATE" 2>/dev/null || true)"
    if [ -n "$vault" ]; then printf '%s/%s' "$vault" "$SHIPYARD_VAULT_TICKETS_DIR"
    else printf '%s/.project/%s' "$REPO_ROOT" "$SHIPYARD_VAULT_TICKETS_DIR"; fi
}

# The sprint the loop is working on, as a file path. Persisted in state under
# the same key the github backend uses, so /deliver status reads one shape.
_vault_sprint_file() {
    local id; id="$(jq -r '.loop.current_iteration.id // empty' "$STATE" 2>/dev/null || true)"
    [ -n "$id" ] || return 1
    local f="$(_vault_sprints_dir)/$id"
    [ -f "$f" ] || return 1
    printf '%s' "$f"
}

# Where a task actually lives. Usually the current sprint, but triage reaches
# into older ones — a blocker outlives the sprint that raised it.
_vault_file_for() {  # <id>
    local id="$1" f
    f="$(grep -l -- "\*\*\[$id\]\*\*" "$(_vault_sprints_dir)"/sprint-*.md 2>/dev/null | head -1 || true)"
    [ -n "$f" ] || return 1
    printf '%s' "$f"
}

# The task block: the task line plus everything under it, up to the next
# first-level task or the next `##` heading. Same extraction the materializer
# used to build an issue body, so an agent reads exactly what it always read.
_vault_block() {  # <id>
    local id="$1" f; f="$(_vault_file_for "$id")" || return 1
    awk -v wanted="$id" '
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
    ' "$f"
}

_vault_task_line() {  # <id>
    local id="$1" f; f="$(_vault_file_for "$id")" || return 1
    grep -m1 -E "^- \[[ xX]\] [^*]*\*\*\[$id\]\*\*" "$f" 2>/dev/null
}

_vault_status_line() {  # <id>
    local id="$1" f; f="$(_vault_file_for "$id")" || return 1
    grep -m1 -F -- "<!-- shipyard-status:$id -->" "$f" 2>/dev/null
}

# The board status of one task, derived from the file alone — so a checkbox or
# a badge a human edited in Obsidian is honoured exactly like one the loop
# wrote. A ticked box wins over any badge: it is the most deliberate mark.
_vault_status_of() {  # <id> → Todo|In Progress|In Review|Blocked|Done
    local id="$1" task status
    task="$(_vault_task_line "$id")" || { printf 'Todo'; return 0; }
    case "$task" in '- [x]'*|'- [X]'*) printf 'Done'; return 0 ;; esac
    status="$(_vault_status_line "$id" || true)"
    case "$status" in
        *"✅"*) printf 'Done' ;;
        *"🔴"*) printf 'Blocked' ;;
        *"🔵"*) printf 'In Review' ;;
        *"🟡"*) printf 'In Progress' ;;
        *)      printf 'Todo' ;;
    esac
}

_vault_title_of() {  # <id>
    _vault_task_line "$1" 2>/dev/null \
        | sed -E "s/^- \[[ xX]\] [^*]*\*\*\[$1\]\*\*[[:space:]]*//"
}

# Every task id declared in one sprint file, in file order — which is the
# operator's own ordering, and therefore the priority they intended.
_vault_ids_in() {  # <sprint-file>
    sed -nE 's/^- \[[ xX]\] [^*]*\*\*\[([^]]+)\]\*\*.*$/\1/p' "$1" 2>/dev/null
}

# ── Sprint selection ─────────────────────────────────────────────────────────
# Same three-step rule as the board: honour the sprint already in flight, else
# the one whose declared period covers today, else the first that still has
# work. Never pick silently by filename order — a sprint list that is simply
# ahead of schedule would strand the loop on sprint 001 forever.
_vault_sprint_period() {  # <sprint-file> → "start<TAB>end"
    awk '
        /^##[[:space:]]/ { in_period = ($0 ~ /Period/) }
        in_period && /^-[[:space:]]*Start:/ { gsub(/^-[[:space:]]*Start:[[:space:]]*/, ""); start = $0 }
        in_period && /^-[[:space:]]*End:/   { gsub(/^-[[:space:]]*End:[[:space:]]*/, "");   end = $0 }
        END { printf "%s\t%s", start, end }
    ' "$1" 2>/dev/null
}

_vault_has_todo() {  # <sprint-file>
    local id
    while IFS= read -r id; do
        [ -n "$id" ] || continue
        [ "$(_vault_status_of "$id")" = "Todo" ] && return 0
    done < <(_vault_ids_in "$1")
    return 1
}

_vault_set_current_sprint() {  # <sprint-file> <ordinal>
    local f="$1" ordinal="$2" base period start end tmp="$STATE.tmp.$$"
    base="$(basename "$f")"
    period="$(_vault_sprint_period "$f")"
    start="${period%%$'\t'*}"; end="${period##*$'\t'}"
    jq --arg id "$base" --arg title "$base" --arg start "$start" --arg end "$end" \
       --argjson sprint "$ordinal" \
       '.loop.current_iteration={id:$id,title:$title,start_date:$start,end_date:$end}
        | .current_sprint=$sprint' "$STATE" >"$tmp" && mv "$tmp" "$STATE"
    log "vault sprint selected: $base (${start:-?} → ${end:-?})"
}

_ticket_vault_init() {
    local dir; dir="$(_vault_sprints_dir)"
    [ -d "$dir" ] || { log "vault tickets: $dir does not exist"; return 1; }
    local -a files=()
    local f
    while IFS= read -r f; do files+=("$f"); done < <(ls -1 "$dir"/sprint-*.md 2>/dev/null | sort)
    [ "${#files[@]}" -gt 0 ] || { log "vault tickets: no sprint file in $dir"; return 1; }

    local saved today selected="" ordinal=1 i=0 period start end
    saved="$(jq -r '.loop.current_iteration.id // empty' "$STATE" 2>/dev/null || true)"
    today="$(date +%F)"
    if [ -n "$saved" ] && [ -f "$dir/$saved" ]; then selected="$dir/$saved"; fi
    if [ -z "$selected" ]; then
        for f in "${files[@]}"; do
            period="$(_vault_sprint_period "$f")"
            start="${period%%$'\t'*}"; end="${period##*$'\t'}"
            [ -n "$start" ] && [ -n "$end" ] || continue
            if [[ "$start" < "$today" || "$start" == "$today" ]] && [[ "$today" < "$end" || "$today" == "$end" ]]; then
                selected="$f"; break
            fi
        done
    fi
    if [ -z "$selected" ]; then
        for f in "${files[@]}"; do _vault_has_todo "$f" && { selected="$f"; break; }; done
    fi
    [ -n "$selected" ] || selected="${files[0]}"
    for f in "${files[@]}"; do
        i=$((i + 1)); [ "$f" = "$selected" ] && { ordinal="$i"; break; }
    done
    _vault_set_current_sprint "$selected" "$ordinal"
    mkdir -p "$(_vault_tickets_dir)" 2>/dev/null || true
}

_ticket_vault_has_sprints() { return 0; }

_ticket_vault_advance_if_drained() {
    local dir current pos=0 current_pos="" f
    dir="$(_vault_sprints_dir)"
    current="$(jq -r '.loop.current_iteration.id // empty' "$STATE" 2>/dev/null || true)"
    [ -n "$current" ] || return 1
    local -a files=()
    while IFS= read -r f; do files+=("$f"); done < <(ls -1 "$dir"/sprint-*.md 2>/dev/null | sort)
    for f in "${files[@]}"; do
        pos=$((pos + 1)); [ "$(basename "$f")" = "$current" ] && { current_pos="$pos"; break; }
    done
    [ -n "$current_pos" ] || return 1
    if ! _vault_has_todo "$dir/$current"; then
        _state_set ".completed_sprints = ((.completed_sprints // []) + [$current_pos] | unique)" || true
    fi
    pos=0
    for f in "${files[@]}"; do
        pos=$((pos + 1))
        [ "$pos" -le "$current_pos" ] && continue
        if _vault_has_todo "$f"; then
            _vault_set_current_sprint "$f" "$pos"
            shipyard_notify "⏭️ Sprint suivant prêt — $(basename "$f")"
            return 0
        fi
    done
    log "vault sprint drained — no later sprint with work left"
    return 1
}

# There is no second board to drift from, and no separate iteration field to
# re-attach a ticket to: the file IS both. Triage releasing an old blocker makes
# it visible again the moment its badge clears, wherever its sprint file sits.
_ticket_vault_reconcile_drift() { return 0; }
_ticket_vault_adopt() { return 0; }
# Dependabot has no vault equivalent; a security ticket is written like any
# other. Silent rather than noisy: this runs on every iteration.
_ticket_vault_sync_external() { return 0; }

# ── Queues ───────────────────────────────────────────────────────────────────
# Every query below ends in an explicit `return 0`. An EMPTY queue is the normal
# end of a sprint, not a failure — and the loop runs under `set -e` with
# `pipefail`, so a listing that returned 1 because its last comparison happened
# to be false killed the run silently, between two log lines, with status 0.
_ticket_vault_list_in_status() {  # <board-status>
    local target="$1" f id; f="$(_vault_sprint_file)" || return 0
    while IFS= read -r id; do
        [ -n "$id" ] || continue
        if [ "$(_vault_status_of "$id")" = "$target" ]; then printf '%s\n' "$id"; fi
    done < <(_vault_ids_in "$f")
    return 0
}

# The widened scan covers EVERY sprint file, not just the current one — same
# reason the github backend unions the label query: a blocker outlives its
# sprint, and a ticket awaiting review must never be dropped.
_ticket_vault_scan_in_status() {  # <board-status>
    local target="$1" f id
    { for f in "$(_vault_sprints_dir)"/sprint-*.md; do
        [ -f "$f" ] || continue
        while IFS= read -r id; do
            [ -n "$id" ] || continue
            if [ "$(_vault_status_of "$id")" = "$target" ]; then printf '%s\n' "$id"; fi
        done < <(_vault_ids_in "$f")
      done; } | _ticket_vault_sort
    return 0
}

_ticket_vault_next_todo() { _ticket_vault_list_in_status "Todo" | head -1; return 0; }

# ── Status writes ────────────────────────────────────────────────────────────
# The loop speaks in status LABELS at this boundary (a GitHub shape the contract
# kept so the two backends share one call), so map them back to the vault's own
# vocabulary and let the existing writer do the careful part.
_vault_state_for_label() {  # <label> → the vault-task-status.sh state name
    case "$1" in
        "$SHIPYARD_TODO_LABEL")    printf 'todo' ;;
        "$SHIPYARD_WIP_LABEL")     printf 'in-progress' ;;
        "$SHIPYARD_REVIEW_LABEL")  printf 'in-review' ;;
        "$SHIPYARD_BLOCKED_LABEL") printf 'blocked' ;;
    esac
}

_vault_write_status() {  # <id> <state-name> [detail]
    local helper="$LOOP_DIR/vault-task-status.sh" out
    [ -x "$helper" ] || { log "vault tickets: status writer missing: $helper"; return 1; }
    out="$("$helper" "$1" "$2" "${3:-}" 2>&1)" || out="vault status write failed for $1"
    [ -n "$out" ] && log "$out"
    return 0
}

# A vault task carries ONE status line, so there is no second mirror to drift
# from and the exclusive setter is the ordinary one. Both entry points are kept
# because the loop's intent differs — a phase transition versus a repair — even
# where the vault makes them identical.
_ticket_vault_set_status() {  # <id> <remove-label> <add-label>
    local state; state="$(_vault_state_for_label "$3")"
    [ -n "$state" ] || return 0
    _vault_write_status "$1" "$state"
}
_ticket_vault_set_status_exclusive() {  # <id> <add-label>
    local state; state="$(_vault_state_for_label "$2")"
    [ -n "$state" ] || return 0
    _vault_write_status "$1" "$state"
}

_ticket_vault_finalize() {  # <id> [from-label]
    _vault_write_status "$1" done
}

# Nothing is deleted: a duplicate stays in the sprint file, ticked, with the
# reason recorded on its ticket note. The vault is a record, not a queue that
# forgets — and an operator scrolling the sprint must still see what happened.
_ticket_vault_close() {  # <id> <completed|not planned>
    if [ "$2" = "not planned" ]; then _vault_write_status "$1" done "non retenue"
    else _vault_write_status "$1" done; fi
}

# ── Content ──────────────────────────────────────────────────────────────────
# Labels have no native home in a markdown checklist, so they are declared on
# their own indented line under the task:
#     ␣␣- Labels : pkg:api, safe
# A task without one simply has no label — which is exactly how the loop already
# treats an issue with no pkg: label: repo-wide scope, nothing fails closed.
_ticket_vault_labels() {  # <id> → JSON array of names
    _vault_block "$1" 2>/dev/null \
        | sed -nE 's/^[[:space:]]+-[[:space:]]*Labels?[[:space:]]*:[[:space:]]*(.+)$/\1/p' \
        | head -1 \
        | tr ',' '\n' \
        | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//; s/^`//; s/`$//' \
        | jq -R . | jq -sc 'map(select(. != ""))' 2>/dev/null || echo '[]'
}

_ticket_vault_meta() {  # <id> → {state,stateReason,title,labels:[{name}]}
    local id="$1" status title labels state reason=""
    _vault_task_line "$id" >/dev/null 2>&1 || return 1
    status="$(_vault_status_of "$id")"
    title="$(_vault_title_of "$id")"
    labels="$(_ticket_vault_labels "$id")"
    # The loop asks "is this still open?" to decide whether a ticket it was
    # tracking has been settled out of band. Delivered or dropped, a Done task
    # is settled; everything else is still live.
    if [ "$status" = "Done" ]; then
        state=CLOSED
        case "$(_vault_status_line "$id" || true)" in *"non retenue"*) reason=NOT_PLANNED ;; esac
    else
        state=OPEN
    fi
    jq -nc --arg state "$state" --arg reason "$reason" --arg title "$title" \
           --argjson labels "$labels" \
        '{state:$state, stateReason:(if $reason=="" then null else $reason end),
          title:$title, labels:($labels | map({name:.}))}'
}

_ticket_vault_title_body() {  # <id>
    local id="$1"
    printf '%s\n\n' "$(_vault_title_of "$id")"
    _vault_block "$id" | tail -n +2
}

_ticket_vault_context() {  # <id>
    local id="$1" labels
    printf '## %s — %s\n\n' "$id" "$(_vault_title_of "$id")"
    _vault_block "$id" | tail -n +2
    labels="$(_ticket_vault_labels "$id" | jq -r 'join(" ")' 2>/dev/null || true)"
    printf '\nLabels: %s\n' "$labels"
}

# The merge step records "PR #70" as the status detail, so the PR that delivered
# a task is readable straight off the sprint line — no API call, and it survives
# a repository the operator can no longer reach.
_ticket_vault_closing_pr() {  # <id>
    _vault_status_line "$1" 2>/dev/null | sed -nE 's/.*PR #([0-9]+).*/\1/p' | head -1
}

# ── The escalation conversation ──────────────────────────────────────────────
# One note per ticket, created on first use. The loop appends its asks; the
# human answers by writing under them in Obsidian. `## ` sections are the
# message boundary, which is what makes "everything after the last ask" a
# well-defined slice without any metadata the human has to maintain.
_vault_ticket_note() {  # <id> → path (created if missing)
    local id="$1" dir note title
    dir="$(_vault_tickets_dir)"
    mkdir -p "$dir" 2>/dev/null || return 1
    note="$dir/$(_ticket_vault_slug "$id").md"
    if [ ! -f "$note" ]; then
        title="$(_vault_title_of "$id" 2>/dev/null || true)"
        {
            printf -- '---\ntags: [ticket/%s, vault/delivery]\n---\n\n' "$id"
            printf '# %s — %s\n\n' "$id" "${title:-sans titre}"
            printf 'Fil de la boucle de livraison. Pour répondre, écris SOUS la dernière demande — tout ce qui la suit est relu comme ta réponse.\n'
        } >"$note"
    fi
    printf '%s' "$note"
}

_ticket_vault_comment() {  # <id> <body>
    local note; note="$(_vault_ticket_note "$1")" || return 0
    {
        printf '\n## %s — boucle\n\n' "$(date +%F' '%H:%M)"
        printf '%s\n' "$2"
    } >>"$note"
    _vault_git_commit "$note" "docs(ticket): $1 — message de la boucle"
}

# Sections, not lines: the count is what the triage budget compares across runs
# to notice "the human answered". A line count would move every time the loop
# itself wrote, which is the noise that budget exists to filter.
_ticket_vault_comments_count() {  # <id> [fallback]
    local note dir c
    dir="$(_vault_tickets_dir)"
    note="$dir/$(_ticket_vault_slug "$1").md"
    [ -f "$note" ] || { printf '%s' "${2:-0}"; return 0; }
    c="$(grep -c '^## ' "$note" 2>/dev/null || true)"
    [[ "$c" =~ ^[0-9]+$ ]] || c="${2:-0}"
    printf '%s' "$c"
}

# Everything written after the section carrying the LAST ask — that is, the
# human's answer to the most recent one, and nothing else.
#
# The slice starts at the first `## ` heading FOLLOWING the last marker, not at
# the marker itself: the ask's own body sits between the two, and feeding the
# loop its own question back as if it were an answer is how an escalation
# re-escalates forever. A newer ask therefore retires the previous answer by
# construction, with no state to keep — there is simply no section after it yet.
_ticket_vault_replies_after() {  # <id> <marker>
    local note dir; dir="$(_vault_tickets_dir)"
    note="$dir/$(_ticket_vault_slug "$1").md"
    [ -f "$note" ] || return 0
    awk -v marker="$2" '
        NR == FNR { if (index($0, marker) > 0) last = FNR; next }
        last == 0 { exit }                       # never asked: nothing answers it
        FNR > last && /^## / { started = 1 }
        started { print }
    ' "$note" "$note" | head -c "${SHIPYARD_REPLY_MAX_CHARS:-8000}"
}

# ── Creating and finding tickets ─────────────────────────────────────────────
# The retrospective is the only ticket the loop opens itself. It is a note, not
# a sprint task: nothing should ever pick it up as work.
_ticket_vault_find_open_by_title() {  # <phrase> → id, or empty
    local dir f; dir="$(_vault_tickets_dir)"
    [ -d "$dir" ] || return 0
    f="$(grep -rl -F -- "$1" "$dir" 2>/dev/null | head -1 || true)"
    [ -n "$f" ] || return 0
    basename "$f" .md
}

_ticket_vault_create() {  # <title> <body-file> <label>
    local dir note slug; dir="$(_vault_tickets_dir)"
    mkdir -p "$dir" 2>/dev/null || return 1
    slug="$(_ticket_vault_slug "$3-$(date +%Y%m%d)")"
    note="$dir/$slug.md"
    {
        printf -- '---\ntags: [ticket/%s, vault/delivery]\n---\n\n' "$3"
        printf '# %s\n\n' "$1"
        cat "$2" 2>/dev/null || true
    } >"$note"
    _vault_git_commit "$note" "docs(ticket): $1"
}

# Labels are plain text in a markdown file: there is no registry to create one
# in, and nothing to fail if it has never been used before.
_ticket_vault_ensure_label() { return 0; }

# A vault task cites another by its id, not by #number. Both notations are
# accepted on the way in — an operator who typed #142 out of habit should still
# have the chain resolved — but only ids that exist are returned.
_ticket_vault_extract_refs() {  # <text>
    local id
    grep -oE '\[?\b[A-Z][A-Z0-9]+-[0-9]+\b\]?' <<<"$1" 2>/dev/null \
        | tr -d '[]' | sort -u | while IFS= read -r id; do
            [ -n "$id" ] || continue
            if _vault_file_for "$id" >/dev/null 2>&1; then printf '%s\n' "$id"; fi
        done
    return 0
}

# ── Persisting to the vault's own git history ────────────────────────────────
# Same discipline as vault-task-status.sh: best-effort, never fatal, and only on
# the vault's main branch — a vault checked out elsewhere is someone mid-edit,
# and committing under them would be rude at best.
_vault_git_commit() {  # <path> <message>
    local path="$1" msg="$2" root
    [ "${SHIPYARD_VAULT_WRITEBACK:-1}" != 0 ] || return 0
    root="$(git -C "$(dirname "$path")" rev-parse --show-toplevel 2>/dev/null || true)"
    [ -n "$root" ] || return 0
    [ "$(git -C "$root" rev-parse --abbrev-ref HEAD 2>/dev/null)" = main ] || return 0
    git -C "$root" add -- "$path" >/dev/null 2>&1 || return 0
    git -C "$root" diff --cached --quiet -- "$path" && return 0
    git -C "$root" commit -q -m "$msg" >/dev/null 2>&1 || return 0
    git -C "$root" push -q origin main >/dev/null 2>&1 && return 0
    git -C "$root" pull --rebase --autostash -q origin main >/dev/null 2>&1 || return 0
    git -C "$root" push -q origin main >/dev/null 2>&1 || true
}
