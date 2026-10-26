#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# claude-invoke.sh — single choke point for every Claude Code call in the loop.
#
# Why one wrapper: it is the ONLY place that knows how the agent is authenticated
# and rate-limited. The quota back-off lives here; adding an API-key fallback for
# true 24/7 later is a one-function change (decision #6 of docs/PLAN.md).
#
# Usage (sourced by agent-loop.sh):
#   out="$(claude_invoke <model> <prompt-file> [--json])"
#
#   <model>        haiku | sonnet | opus   (mapped to full ids below)
#   <prompt-file>  path to a file whose contents become the prompt
#   --json         ask Claude Code for JSON output (parsed by the caller)
#
# On a usage/rate-limit hit the call does NOT fail the loop: it checkpoints
# .project/state.json (status=paused, resume_after) and sleeps in bounded,
# re-probed chunks until the window is expected to reset (or reopens early —
# Max's limit is rolling), then retries. Everything else is a hard error.
# ─────────────────────────────────────────────────────────────────────────────

# Map friendly tier names to what `claude --model` accepts. We use the short
# aliases on purpose: they are stable across Claude Code versions, unlike pinned
# model ids. Sonnet does the bulk (quota endurance), Opus reviews, Haiku the
# mechanical steps. Override a tier with SHIPYARD_MODEL_<TIER> (raw id or alias).
_shipyard_model_id() {
    case "$1" in
        haiku)  echo "${SHIPYARD_MODEL_HAIKU:-haiku}" ;;
        sonnet) echo "${SHIPYARD_MODEL_SONNET:-sonnet}" ;;
        opus)   echo "${SHIPYARD_MODEL_OPUS:-opus}" ;;
        *)      echo "$1" ;;   # allow passing a raw id through
    esac
}

# Seconds to wait when a rate-limit is hit and we cannot parse a reset time.
# Max windows roll ~5h; we probe more often in case the window already reset.
: "${SHIPYARD_BACKOFF_SECONDS:=1800}"

# How many times to retry a single call across back-off windows before giving up.
: "${SHIPYARD_MAX_BACKOFFS:=8}"

# How often to re-probe during a long back-off instead of sleeping through the
# whole announced wait. Max's session limit is a ROLLING window (~5h): the
# CLI's "resets HH:MM" is a ceiling based on usage at the moment of the hit,
# not a guarantee — older usage falls out of the window and quota can free up
# well before that time. Observed: a "resets 8:30am" message parsed to a ~12h
# sleep at 20:00, while a cheap probe an hour later already succeeded — the
# loop sat idle through a reopened window instead of resuming. One attempt
# still costs one SHIPYARD_MAX_BACKOFFS slot regardless of how many probes ran.
: "${SHIPYARD_RATE_LIMIT_PROBE_SECONDS:=1800}"

# Wall-clock ceiling for ONE agent call. Nothing else bounded this step: gates get
# SHIPYARD_LOCAL_GATE_TIMEOUT and the CI wait gets SHIPYARD_CI_TIMEOUT, but a
# session that wandered — or delegated to a sub-agent that wandered — held its
# worktree and the loop's only slot indefinitely, with no log line to say so.
# Generous on purpose: a real dev step legitimately runs tests between edits.
: "${SHIPYARD_AGENT_TIMEOUT:=2700}"

# Tools withheld from the agent for this call, space-separated (empty = none).
# Set per call site, never globally — see resolve_conflicts() in agent-loop.sh.
: "${SHIPYARD_DISALLOWED_TOOLS:=}"

# Optional API-key fallback (decision #6): a dedicated Anthropic API key used ONLY
# when the Max subscription is rate-limited. We use a shipyard-specific var (not the
# ambient ANTHROPIC_API_KEY) so a stray key in your env never silently bills the API —
# Max stays the default. In headless `-p`, ANTHROPIC_API_KEY (precedence over the
# subscription) is used automatically when present, so the fallback is just an env swap.
: "${SHIPYARD_FALLBACK_API_KEY:=}"
_SHIPYARD_ON_FALLBACK=0   # sticky within a run once Max is exhausted (restart to reset)
# claude_invoke is normally executed through command substitution, so mutations to a
# shell variable do not reach the parent shell. A PID-scoped marker keeps the fallback
# sticky across those subshells while naturally resetting on the next loop process.
_SHIPYARD_FALLBACK_MARKER="${STATE:-${TMPDIR:-/tmp}/shipyard-state}.api-key-fallback.$$"
rm -f "$_SHIPYARD_FALLBACK_MARKER"

# Redact credentials before agent output or infrastructure errors can reach a
# log, state file, GitHub comment/PR, or notification. Exact known environment
# values are removed first, then common credential signatures are covered for
# secrets an agent may have copied from another source.
shipyard_redact() {
    local text name value
    text="$(cat)"
    for name in \
        SHIPYARD_FALLBACK_API_KEY ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN \
        CLAUDE_CODE_OAUTH_TOKEN GH_TOKEN GITHUB_TOKEN \
        AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN \
        SHIPYARD_TELEGRAM_TOKEN SHIPYARD_NTFY_TOPIC SHIPYARD_WEBHOOK_URL; do
        value="${!name-}"
        [ -n "$value" ] && text="${text//"$value"/[REDACTED]}"
    done
    printf '%s' "$text" | sed -E \
        -e 's/sk-ant-[[:alnum:]_-]{8,}/[REDACTED]/g' \
        -e 's/gh[pousr]_[[:alnum:]]{20,}/[REDACTED]/g' \
        -e 's/github_pat_[[:alnum:]_]{20,}/[REDACTED]/g' \
        -e 's/AKIA[0-9A-Z]{16}/[REDACTED]/g' \
        -e 's/[0-9]{6,12}:[[:alnum:]_-]{20,}/[REDACTED]/g' \
        -e 's/(Bearer[[:space:]]+)[[:alnum:]_.~+\/=:-]{12,}/\1[REDACTED]/gI' \
        -e 's/((api[_-]?key|token|secret|password)[[:space:]]*[:=][[:space:]]*)[^[:space:],;]+/\1[REDACTED]/gI'
}

# Detect a usage/rate-limit condition from Claude Code output. Claude Code's actual
# CLI message ("You've hit your session limit · resets 3:30am (Europe/Berlin)")
# matched neither "usage limit" (it says "session limit") nor "resets? at" (no
# literal "at") — every real hit fell through to the hard-failure path instead of
# the checkpoint/sleep/retry below, burning attempts and escalating with a
# misleading "spec unclear" message instead of waiting out the window.
_shipyard_is_rate_limited() {
    grep -qiE 'rate.?limit|usage limit|session limit|quota|too many requests|resets?[^0-9]{0,8}[0-9]|429' <<<"$1"
}

# Cheap check whether Max usable again, without waiting for a full sleep to
# elapse: smallest possible call (haiku, one-word reply) so a probe barely
# dents quota. rc 0 = available, rc 1 = still limited (or the probe itself
# hard-failed, e.g. transient network — treated the same: keep sleeping).
_shipyard_probe_rate_limit_cleared() {
    local probe_out probe_rc
    set +e
    probe_out="$(printf 'Reply with exactly: ok' | env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN \
        timeout --kill-after=10 30 \
        claude -p --model haiku --permission-mode "${SHIPYARD_PERMISSION_MODE:-acceptEdits}" 2>&1)"
    probe_rc=$?
    set -e
    [ "$probe_rc" -eq 0 ] && ! _shipyard_is_rate_limited "$probe_out"
}

# Best-effort: seconds to wait, parsed from the rate-limit text. Empty if unknown, so
# the caller falls back to SHIPYARD_BACKOFF_SECONDS. Keeps us from over/under-sleeping.
_shipyard_parse_wait() {
    local t="$1" now target hh mm
    if [[ "$t" =~ try\ again\ in\ ([0-9]+)\ *(second|sec|s) ]]; then echo "${BASH_REMATCH[1]}"; return; fi
    if [[ "$t" =~ ([0-9]+)\ *(minute|min) ]]; then echo $(( ${BASH_REMATCH[1]} * 60 )); return; fi
    if [[ "$t" =~ ([0-9]+)\ *hour ]]; then echo $(( ${BASH_REMATCH[1]} * 3600 )); return; fi
    if [[ "$t" =~ resets?[^0-9]{0,8}([0-9]{10}) ]]; then
        now=$(date +%s); target="${BASH_REMATCH[1]}"; [ "$target" -gt "$now" ] && echo $(( target - now )); return
    fi
    if [[ "$t" =~ resets?[^0-9]{0,8}([0-9]{1,2}):([0-9]{2}) ]]; then
        hh="${BASH_REMATCH[1]}"; mm="${BASH_REMATCH[2]}"; now=$(date +%s)
        target=$(date -d "today ${hh}:${mm}" +%s 2>/dev/null || echo "")
        [ -n "$target" ] && { [ "$target" -le "$now" ] && target=$(( target + 86400 )); echo $(( target - now )); }
        return
    fi
}

# Serialize a critical section with flock (P5.3 worktree parallelism). With
# SHIPYARD_PARALLELISM>1, several process_issue subshells mutate state.json /
# create worktrees / merge PRs concurrently — flock turns those read-modify-write
# races into safe sequential updates. Degrades to a no-op serialization when flock
# is unavailable (single-worker setups don't need it). stdout of <cmd> propagates.
_with_lock() {  # _with_lock <lockfile> <cmd...>
    local lock="$1"; shift
    if [ -n "$lock" ] && command -v flock >/dev/null 2>&1; then
        ( flock 9 || true; "$@" ) 9>"$lock"
    else
        "$@"
    fi
}

# Persist a checkpoint into state.json (best-effort; never aborts the loop).
_shipyard_checkpoint_paused() {
    local reason="$1" resume_after="$2"
    [ -f "$STATE" ] || return 0
    _with_lock "${STATE}.lock" _shipyard_checkpoint_paused_unlocked "$reason" "$resume_after"
}
_shipyard_checkpoint_paused_unlocked() {
    local reason="$1" resume_after="$2" tmp="$STATE.tmp.$$"
    jq --arg r "$reason" --arg t "$resume_after" \
       '.loop.status="paused" | .loop.paused_reason=$r | .loop.resume_after=$t' \
       "$STATE" >"$tmp" 2>/dev/null && mv "$tmp" "$STATE" || rm -f "$tmp"
}

_shipyard_checkpoint_running() {
    [ -f "$STATE" ] || return 0
    _with_lock "${STATE}.lock" _shipyard_checkpoint_running_unlocked
}
_shipyard_checkpoint_running_unlocked() {
    local tmp="$STATE.tmp.$$"
    jq 'if .loop.status == "paused" and .loop.paused_reason == "manual" then .
        else .loop.status="running" | .loop.paused_reason=null | .loop.resume_after=null end' \
       "$STATE" >"$tmp" 2>/dev/null && mv "$tmp" "$STATE" || rm -f "$tmp"
}

# Run one `claude -p` with the chosen auth. Echoes output (stdout+stderr), returns rc.
#   mode=key  → force the fallback API key (and hide any gateway token so it wins)
#   mode=max  → subscription; if a fallback key is configured, hide any ambient key
#               so Max is used deterministically (never accidentally bill the API)
#
# `timeout` wraps the call so a wandering session cannot hold the loop forever.
# --kill-after: claude gets TERM first (it can flush its transcript), SIGKILL only
# if it ignores that. rc 124 identifies the timeout to claude_invoke below.
_shipyard_run_claude() {
    local mode="$1"
    if [ "$mode" = "key" ]; then
        env -u ANTHROPIC_AUTH_TOKEN ANTHROPIC_API_KEY="$SHIPYARD_FALLBACK_API_KEY" \
            timeout --kill-after=30 "$SHIPYARD_AGENT_TIMEOUT" \
            claude "${args[@]}" <"$prompt_file" 2>&1
    else
        # Max/OAuth must be deterministic: never let ambient direct-API credentials
        # silently switch this run to usage-based billing. Bedrock/Vertex selectors
        # and their provider credentials remain untouched.
        env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN \
            timeout --kill-after=30 "$SHIPYARD_AGENT_TIMEOUT" \
            claude "${args[@]}" <"$prompt_file" 2>&1
    fi
}

# claude_invoke <model> <prompt-file> [--json]
# Echoes Claude's response on stdout. Returns non-zero only on a hard failure.
claude_invoke() {
    local tier="$1" prompt_file="$2" json="${3:-}"
    local model; model="$(_shipyard_model_id "$tier")"

    # Headless autonomy needs a non-interactive permission posture: a `-p` run
    # cannot answer prompts, so a restrictive mode would stall the dev step (it
    # must edit files AND run tests). Default to acceptEdits; the loop on a
    # sandboxed/throwaway target sets SHIPYARD_PERMISSION_MODE=bypassPermissions.
    # Hardening is layered and lives in .claude/settings.json (shipped by the
    # scaffold): permissions.deny + a PreToolUse guard hook + an optional OS
    # sandbox (bubblewrap). bypassPermissions skips project permission rules,
    # so critical Bash invariants are duplicated in the guard hook. See
    # docs/REMOTE.md § "Sandbox & permissions".
    local -a args=(-p --model "$model" --permission-mode "${SHIPYARD_PERMISSION_MODE:-acceptEdits}")
    [ "$json" = "--json" ] && args+=(--output-format json)
    # Withheld tools are enforced by the CLI, not merely asked for in the prompt:
    # a prompt line is advice a model may reason its way around, and the whole
    # point of the call sites that set this is that the alternative is expensive.
    # shellcheck disable=SC2206  # deliberate word splitting: space-separated list
    [ -n "$SHIPYARD_DISALLOWED_TOOLS" ] && args+=(--disallowedTools ${SHIPYARD_DISALLOWED_TOOLS})

    local attempt=0 out rc mode tried_key
    while :; do
        # Auth for this attempt: once Max is exhausted this run, stick to the key.
        if { [ "$_SHIPYARD_ON_FALLBACK" = 1 ] || [ -f "$_SHIPYARD_FALLBACK_MARKER" ]; } \
            && [ -n "${SHIPYARD_FALLBACK_API_KEY:-}" ]; then
            mode="key"
        else
            mode="max"
        fi
        [ "$mode" = "key" ] && tried_key=1 || tried_key=0

        set +e
        out="$(_shipyard_run_claude "$mode")"
        rc=$?
        set -e

        if [ "$rc" -eq 0 ]; then
            _shipyard_checkpoint_running
            printf '%s' "$out"
            return 0
        fi

        if _shipyard_is_rate_limited "$out"; then
            # Path A — a fallback key exists and we're not already on it: switch NOW,
            # no sleep. Sticky for the rest of the run so we stop hammering Max.
            if [ -n "${SHIPYARD_FALLBACK_API_KEY:-}" ] && [ "$tried_key" -eq 0 ]; then
                _SHIPYARD_ON_FALLBACK=1
                : >"$_SHIPYARD_FALLBACK_MARKER"
                _shipyard_checkpoint_running
                echo "claude-invoke: Max rate-limited → falling back to the API key for the rest of this run" >&2
                shipyard_notify "🔁 Quota Max atteint — bascule sur la clé API (fallback)" 2>/dev/null || true
                continue
            fi
            # Path B — no key (or the key itself is limited): back off and retry.
            attempt=$((attempt + 1))
            if [ "$attempt" -gt "$SHIPYARD_MAX_BACKOFFS" ]; then
                echo "claude-invoke: still rate-limited after $SHIPYARD_MAX_BACKOFFS back-offs; giving up" >&2
                return 3
            fi
            local wait; wait="$(_shipyard_parse_wait "$out")"; : "${wait:=$SHIPYARD_BACKOFF_SECONDS}"
            local resume_at
            resume_at="$(date -d "@$(( $(date +%s) + wait ))" +%FT%T 2>/dev/null || echo "unknown")"
            _shipyard_checkpoint_paused "rate_limit" "$resume_at"
            shipyard_notify "⏸️ Quota atteint — pause ${wait}s, reprise vers ${resume_at}" 2>/dev/null || true
            echo "claude-invoke: rate-limited, sleeping up to ${wait}s (attempt ${attempt}/${SHIPYARD_MAX_BACKOFFS}, re-probing every ${SHIPYARD_RATE_LIMIT_PROBE_SECONDS}s)" >&2
            # Sleep in bounded chunks and re-probe rather than trusting the
            # announced reset time blindly — see SHIPYARD_RATE_LIMIT_PROBE_SECONDS
            # above. This attempt still counts as one against SHIPYARD_MAX_BACKOFFS
            # no matter how many chunks it took.
            local slept=0 chunk
            while [ "$slept" -lt "$wait" ]; do
                chunk=$(( wait - slept < SHIPYARD_RATE_LIMIT_PROBE_SECONDS ? wait - slept : SHIPYARD_RATE_LIMIT_PROBE_SECONDS ))
                sleep "$chunk"
                slept=$(( slept + chunk ))
                if [ "$slept" -lt "$wait" ] && _shipyard_probe_rate_limit_cleared; then
                    echo "claude-invoke: quota back after ${slept}s of ${wait}s announced — resuming early" >&2
                    shipyard_notify "▶️ Quota revenu plus tôt que prévu (après ${slept}s) — reprise" 2>/dev/null || true
                    break
                fi
            done
            continue
        fi

        # A timeout is not a code problem and must not read like one: say what was
        # exceeded and by which knob, so the escalation the caller raises is
        # actionable instead of a truncated transcript.
        if [ "$rc" -eq 124 ] || [ "$rc" -eq 137 ]; then
            echo "claude-invoke: agent interrompu — délai de ${SHIPYARD_AGENT_TIMEOUT}s dépassé (SHIPYARD_AGENT_TIMEOUT)" >&2
            printf '%s\n' "$out" | tail -20 | shipyard_redact >&2
            return 124
        fi

        # --- any other error is hard ------------------------------------------
        echo "claude-invoke: hard failure (rc=$rc):" >&2
        printf '%s\n' "$out" | shipyard_redact >&2
        return "$rc"
    done
}
