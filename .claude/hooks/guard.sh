#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# guard.sh — PreToolUse backstop for Bash calls (defense-in-depth).
#
# Wired as a PreToolUse hook (matcher: Bash) in .claude/settings.json. It reads
# the tool call on stdin and DENIES a small set of catastrophic patterns that the
# static deny-list in settings.json cannot catch reliably — subshells, piped
# obfuscation, root/home deletes — because those slip past prefix rules.
#
# Layers (this is the LAST one, not the only one):
#   1. permissions.deny in settings.json  — always wins, all modes
#   2. Claude Code native rm -rf / ~ circuit breaker
#   3. Optional OS sandbox (bubblewrap)   — real FS/network isolation
#   4. THIS hook                          — pattern backstop for the gaps in (1)
#
# Contract: print a PreToolUse "deny" decision on stdout to block; print nothing
# and exit 0 to defer to the normal permission flow. Never exits non-zero (a
# failing hook must not wedge the loop).
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
set -f   # no globbing: token scan below must see literal '/*', '~/*' — never expand them

input="$(cat 2>/dev/null || true)"
cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // ""' 2>/dev/null || true)"
[ -n "$cmd" ] || exit 0

deny() {
    local reason; reason="$(printf 'shipyard guard: %s' "$1" | jq -Rs . 2>/dev/null)"
    [ -n "$reason" ] || reason='"shipyard guard: blocked"'
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":%s}}\n' "$reason"
    exit 0
}

lc="$(printf '%s' "$cmd" | tr '[:upper:]' '[:lower:]')"

# 1 — Remote code execution: fetch a payload and pipe it straight into a shell.
printf '%s' "$lc" | grep -Eq '(curl|wget|fetch)[^|]*\|[[:space:]]*(sudo[[:space:]]+)?(ba|z|da|k|c)?sh' \
    && deny "remote script piped into a shell (e.g. curl … | bash)"
printf '%s' "$lc" | grep -Eq 'base64[[:space:]]+-?[a-z]*d[a-z]*[^|]*\|[[:space:]]*(ba)?sh' \
    && deny "base64-decoded payload piped into a shell"

# 2 — Force-push. Project deny rules cover normal permission modes, while
#     bypassPermissions skips them; duplicate this critical invariant here.
printf '%s' "$lc" | grep -Eq '(^|[;&|][[:space:]]*)git[[:space:]]+push[[:space:]]+([^;&|]*[[:space:]])?(--force|-f)([[:space:]]|$)' \
    && deny "forced git push"

# 3 — Catastrophic recursive delete of a filesystem/home ROOT (native breaker
#     only covers a bare '/' and '~'; this also covers $HOME and glob roots).
if printf '%s' "$lc" | grep -Eq -- '--no-preserve-root'; then
    deny "rm --no-preserve-root"
fi
if printf '%s' "$lc" | grep -Eq 'rm[[:space:]]+[^;&|]*-[a-z]*r'; then   # a recursive rm is present
    for tok in $cmd; do
        case "$tok" in
            /|'/*'|'~'|'~/'|'~/*'|'$HOME'|'$HOME/'|'$HOME/*'|'${HOME}'|'${HOME}/'|'${HOME}/*')
                deny "recursive delete of a root/home path ($tok)" ;;
        esac
    done
fi

# 4 — Raw disk / partition destruction.
printf '%s' "$lc" | grep -Eq '(^|[;&|[:space:]])(dd[[:space:]]+if=|mkfs[.[:space:]]|>[[:space:]]*/dev/(sd|nvme|xvd|hd))' \
    && deny "raw disk/partition write"

# 5 — Fork bomb.
printf '%s' "$cmd" | grep -Eq ':\(\)[[:space:]]*\{[[:space:]]*:[[:space:]]*\|' \
    && deny "fork bomb"

# 6 — Persistence / privilege escalation footholds.
printf '%s' "$lc" | grep -Eq '(^|[;&|[:space:]])crontab[[:space:]]+-' \
    && deny "crontab modification"
printf '%s' "$lc" | grep -Eq '>>?[[:space:]]*[^;&|]*authorized_keys' \
    && deny "writing to authorized_keys"

# 7 — World-writable perms.
printf '%s' "$lc" | grep -Eq 'chmod[[:space:]]+(-[a-z]*[[:space:]]+)*0?777([[:space:]]|$)' \
    && deny "chmod 777 (world-writable)"

# 8 — History rewrite via amend. The dev role gets git fetch/merge/add/commit
# (and, as of 2026-08-08, rebase) on its own branch so it can resync itself with
# the base and resolve conflicts (issue #59: it used to be able only to describe
# the exact command a human had to run instead of running it). `--amend` stays
# blocked: it rewrites a commit identity the orchestrator may already have
# recorded across sessions, the same desync risk as a force-push. Rebase carries
# that same identity-rewrite risk but is allowed anyway — accepted explicitly so
# the dev role can rebase onto a moved base instead of only merging.
printf '%s' "$lc" | grep -Eq '(^|[;&|[:space:]])git[[:space:]]+commit[[:space:]]+[^;&|]*--amend' \
    && deny "git commit --amend rewrites history on a branch the orchestrator may resume"

exit 0
