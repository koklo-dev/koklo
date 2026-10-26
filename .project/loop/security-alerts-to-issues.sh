#!/usr/bin/env bash
# Project the repository's open Dependabot alerts onto the delivery board.
#
# Dependabot raises alerts, and (when automated-security-fixes is enabled) opens
# PRs for the ones it can patch on its own. Neither of those is visible to the
# shipyard loop, which only ever pulls Project items in Todo for the current
# Sprint — so an alert Dependabot cannot fix by itself was seen by nobody.
#
# This turns each vulnerable package into exactly one issue on the board, which
# makes it ordinary work the loop picks up like any other ticket.
#
# One issue PER PACKAGE, not per alert: a single package can account for ten
# alerts whose single remedy is one version bump. Per-alert issues would be ten
# tickets resolved by one commit.
set -euo pipefail

: "${SHIPYARD_SEC_MIN_SEVERITY:=high}"   # critical | high | medium | low
: "${SHIPYARD_SEC_LABEL:=security}"
: "${SHIPYARD_TODO_LABEL:=status:todo}"
: "${SHIPYARD_SEC_DRY_RUN:=0}"           # 1 = print what would be filed, touch nothing

log() { printf '[%s] sec-alerts: %s\n' "$(date +%H:%M:%S)" "$*" >&2; }

HERE="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
UPSERT="$HERE/upsert-project-issue.sh"
STATE="$HERE/../state.json"

PROJECT_NUMBER="${1:-}"
PROJECT_OWNER="${2:-}"
[ -n "$PROJECT_NUMBER" ] && [ -n "$PROJECT_OWNER" ] || {
    echo "usage: security-alerts-to-issues.sh <project-number> <project-owner>" >&2; exit 2; }
[ -x "$UPSERT" ] || { echo "helper missing: $UPSERT" >&2; exit 2; }
command -v gh >/dev/null || { echo "gh required" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq required" >&2; exit 1; }

REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"

# An advisory with no upstream fix has to be mitigated and tracked somewhere.
# Detected, not assumed: SHIPYARD_SEC_ALLOWLIST wins, else the conventional path
# when the project keeps one, else the criterion stays prose.
ALLOWLIST="${SHIPYARD_SEC_ALLOWLIST:-}"
if [ -z "$ALLOWLIST" ] && [ -f "$HERE/../../.github/audit-allowlist.json" ]; then
    ALLOWLIST=".github/audit-allowlist.json"
fi

# The acceptance criteria must name commands this project actually runs, so they
# come from the stack profile rather than from a hardcoded package manager. A
# project whose profile is still empty gets prose instead of a fabricated command.
state_cmd() {   # state_cmd <key> — echoes the project command, or nothing
    [ -f "$STATE" ] || return 0
    jq -r --arg k "$1" '.stack_profile.commands[$k] // empty' "$STATE" 2>/dev/null || true
}
PKG_MANAGER="$(jq -r '.stack_profile.package_manager // empty' "$STATE" 2>/dev/null || true)"
BUILD_CMD="$(state_cmd build)"
TEST_CMD="$(state_cmd test)"

# Auditing is not covered by the six standard commands, so derive it from the
# package manager. Override with SHIPYARD_SEC_AUDIT_CMD for anything exotic.
if [ -z "${SHIPYARD_SEC_AUDIT_CMD:-}" ]; then
    case "$PKG_MANAGER" in
        pnpm)          SHIPYARD_SEC_AUDIT_CMD='pnpm audit --prod --audit-level=high' ;;
        npm)           SHIPYARD_SEC_AUDIT_CMD='npm audit --omit=dev --audit-level=high' ;;
        yarn)          SHIPYARD_SEC_AUDIT_CMD='yarn npm audit --environment production --severity high' ;;
        bun)           SHIPYARD_SEC_AUDIT_CMD='bun audit' ;;
        cargo)         SHIPYARD_SEC_AUDIT_CMD='cargo audit' ;;
        poetry|pip|uv) SHIPYARD_SEC_AUDIT_CMD='pip-audit' ;;
        go)            SHIPYARD_SEC_AUDIT_CMD='govulncheck ./...' ;;
        composer)      SHIPYARD_SEC_AUDIT_CMD='composer audit' ;;
        *)             SHIPYARD_SEC_AUDIT_CMD='' ;;
    esac
fi

# Where the bump has to land, and how to force it when the vulnerable package is
# a transitive dependency. Keyed on the ALERT's ecosystem, not on the project's
# package manager: a polyglot repository raises alerts on several at once.
lockfile_for() {
    case "$1" in
        npm)
            case "$PKG_MANAGER" in
                pnpm) echo '`pnpm-lock.yaml`' ;;
                npm)  echo '`package-lock.json`' ;;
                yarn) echo '`yarn.lock`' ;;
                bun)  echo '`bun.lock`' ;;
                *)    echo 'le lockfile du gestionnaire de paquets' ;;
            esac ;;
        pip)      echo 'le fichier de contraintes (`requirements*.txt`, `poetry.lock`, `uv.lock`)' ;;
        rust)     echo '`Cargo.lock`' ;;
        go)       echo '`go.mod` / `go.sum`' ;;
        maven)    echo '`pom.xml`' ;;
        composer) echo '`composer.lock`' ;;
        nuget)    echo 'le fichier de projet NuGet' ;;
        rubygems) echo '`Gemfile.lock`' ;;
        *)        echo 'le manifeste de dépendances' ;;
    esac
}
override_hint_for() {
    case "$1" in
        npm)
            case "$PKG_MANAGER" in
                pnpm) echo ' (bump direct, ou `pnpm.overrides` si la dépendance est transitive et que le parent ne l'"'"'a pas encore relevée)' ;;
                yarn) echo ' (bump direct, ou `resolutions` si la dépendance est transitive et que le parent ne l'"'"'a pas encore relevée)' ;;
                *)    echo ' (bump direct, ou `overrides` si la dépendance est transitive et que le parent ne l'"'"'a pas encore relevée)' ;;
            esac ;;
        rust) echo ' (bump direct, ou `[patch]` si la dépendance est transitive)' ;;
        go)   echo ' (bump direct, ou directive `replace` si la dépendance est transitive)' ;;
        *)    echo '' ;;
    esac
}

# Severity is ordinal, not lexical: sort by rank so a threshold comparison works.
rank_of() {
    case "$1" in
        critical) echo 4 ;; high) echo 3 ;; medium|moderate) echo 2 ;; low) echo 1 ;; *) echo 0 ;;
    esac
}
MIN_RANK="$(rank_of "$SHIPYARD_SEC_MIN_SEVERITY")"

# The alerts endpoint 404s when Dependabot alerts are disabled for the repo, and
# 403s without the security_events scope. Neither is worth failing the loop over.
alerts="$(gh api "repos/$REPO/dependabot/alerts?state=open&per_page=100" --paginate 2>/dev/null || true)"
jq -e 'arrays' >/dev/null 2>&1 <<<"$alerts" || {
    log "Dependabot alerts unavailable (disabled, or token lacks security_events) — skipping"
    exit 0
}

total="$(jq 'length' <<<"$alerts")"
[ "$total" -gt 0 ] || { log "no open alerts"; exit 0; }

# Group by package, keeping the highest severity and the highest patched version
# across that package's alerts — bumping to the max satisfies every advisory at once.
#
# The severity threshold filters GROUPS, never alerts: dropping a package's
# low-severity alerts first would compute a target version that leaves them
# unfixed (a package's high alerts may be patched in 6.27.0, its medium ones in
# 6.28.0). One bump, so it has to clear every advisory on that package.
groups="$(jq -c --argjson min "$MIN_RANK" '
    def rank: {"critical":4,"high":3,"medium":2,"moderate":2,"low":1}[.] // 0;
    # Version ordering is numeric per component, not lexical: "6.9.0" sorts
    # ABOVE "6.28.0" as a string, which would pick a target below the real fix.
    def semver: [splits("[.+-]")] | map(tonumber? // 0);
    [ .[]
      | { ecosystem: .dependency.package.ecosystem,
          name:      .dependency.package.name,
          scope:     (.dependency.scope // "unknown"),
          manifest:  (.dependency.manifest_path // "?"),
          severity:  .security_advisory.severity,
          ghsa:      .security_advisory.ghsa_id,
          cve:       (.security_advisory.cve_id // "—"),
          summary:   .security_advisory.summary,
          url:       .html_url,
          fix:       (.security_vulnerability.first_patched_version.identifier // "") } ]
    | group_by(.ecosystem + "/" + .name)
    | map({ ecosystem: .[0].ecosystem,
            name:      .[0].name,
            scope:     ([.[].scope] | unique | join(", ")),
            manifest:  ([.[].manifest] | unique | join(", ")),
            severity:  ([.[].severity] | max_by(rank)),
            count:     length,
            fix:       ([.[].fix | select(. != "")] | sort_by(semver) | last // ""),
            alerts:    (. | sort_by(.severity | rank) | reverse) })
    | map(select((.severity | rank) >= $min))
    | sort_by(.severity | rank) | reverse
' <<<"$alerts")"

n_groups="$(jq 'length' <<<"$groups")"
log "$total open alert(s) → $n_groups package(s) at or above '$SHIPYARD_SEC_MIN_SEVERITY'"
[ "$n_groups" -gt 0 ] || exit 0

# Ensure the label exists before the first issue references it.
if [ "$SHIPYARD_SEC_DRY_RUN" = 0 ]; then
    gh label create "$SHIPYARD_SEC_LABEL" --color B60205 \
        --description "Vulnérabilité de dépendance — projetée depuis les alertes Dependabot" \
        >/dev/null 2>&1 || true
fi

created=0
for i in $(seq 0 $((n_groups - 1))); do
    g="$(jq -c ".[$i]" <<<"$groups")"
    name="$(jq -r '.name' <<<"$g")"
    eco="$(jq -r '.ecosystem' <<<"$g")"
    sev="$(jq -r '.severity' <<<"$g")"
    fix="$(jq -r '.fix' <<<"$g")"
    count="$(jq -r '.count' <<<"$g")"

    # Deliberately version-free so the title stays stable as alerts accumulate:
    # a new advisory on an already-tracked package reuses the existing issue
    # rather than opening a second one for the same bump.
    title="[SEC] $eco/$name — corriger les vulnérabilités connues"

    # Reuse rather than re-upsert. upsert-project-issue.sh forces Status back to
    # Todo, which would yank an issue the loop is actively developing back into
    # the queue. An existing open issue is already tracked: leave it alone.
    # Quoted as an exact phrase: unquoted, punctuation in the title (brackets, colons)
    # can break GitHub's search grammar and make the query silently match nothing,
    # which defeats the "reuse rather than re-upsert" dedup above (see agent-loop.sh's
    # retro-issue bug, 2026-08-08, for the failure mode this guards against).
    existing="$(gh issue list --state open --search "\"$title\" in:title" --limit 50 --json number,title 2>/dev/null \
        | jq -r --arg t "$title" '[.[] | select(.title==$t)][0].number // empty' 2>/dev/null || true)"
    if [ -n "$existing" ]; then
        log "#$existing already tracks $name — untouched"
        continue
    fi

    body="$(mktemp)"
    {
        printf '## Contexte\n\n'
        printf '`%s` cumule **%s alerte(s) Dependabot ouverte(s)**, sévérité maximale **%s**.\n' \
            "$name" "$count" "$sev"
        printf 'Issue générée automatiquement depuis les alertes du dépôt par `.project/loop/security-alerts-to-issues.sh`.\n\n'
        printf -- '- **Écosystème** : %s\n' "$eco"
        printf -- '- **Portée** : %s\n' "$(jq -r '.scope' <<<"$g")"
        printf -- '- **Manifeste** : `%s`\n' "$(jq -r '.manifest' <<<"$g")"
        if [ -n "$fix" ]; then
            printf -- '- **Version corrigée la plus haute** : `%s`\n' "$fix"
        else
            printf -- '- **Version corrigée** : aucune publiée en amont à ce jour\n'
        fi
        printf '\n## Avis\n\n| Sévérité | GHSA | CVE | Corrigé dans | Résumé |\n|---|---|---|---|---|\n'
        jq -r '.alerts[] | "| \(.severity) | [\(.ghsa)](\(.url)) | \(.cve) | \(if .fix == "" then "—" else "`" + .fix + "`" end) | \(.summary | gsub("[|\n]"; " ")) |"' <<<"$g"
        printf '\n## Critères d'\''acceptation\n\n'
        if [ -n "$fix" ]; then
            printf -- '- [ ] `%s` est résolu en `%s` ou plus haut dans %s%s\n' \
                "$name" "$fix" "$(lockfile_for "$eco")" "$(override_hint_for "$eco")"
        else
            # Name the allowlist only if the project actually keeps one: pointing
            # at a file that does not exist would read as an existing convention.
            if [ -n "$ALLOWLIST" ]; then
                printf -- '- [ ] Aucun correctif amont : documenter la mitigation (chemins réellement atteints, exposition en production) et inscrire l'\''avis dans `%s` avec une date de revue\n' "$ALLOWLIST"
            else
                printf -- '- [ ] Aucun correctif amont : documenter la mitigation (chemins réellement atteints, exposition en production) et inscrire l'\''avis dans une allowlist d'\''audit versionnée, avec une date de revue\n'
            fi
        fi
        if [ -n "$SHIPYARD_SEC_AUDIT_CMD" ]; then
            printf -- '- [ ] `%s` ne remonte plus cet avis (ou il est explicitement allowlisté avec justification)\n' \
                "$SHIPYARD_SEC_AUDIT_CMD"
        else
            printf -- '- [ ] L'\''audit de dépendances du projet ne remonte plus cet avis (ou il est explicitement allowlisté avec justification)\n'
        fi
        if [ -n "$BUILD_CMD" ] && [ -n "$TEST_CMD" ]; then
            printf -- '- [ ] `%s` et `%s` restent verts\n' "$BUILD_CMD" "$TEST_CMD"
        else
            printf -- '- [ ] Le build et les tests du projet restent verts\n'
        fi
        if [ -n "$fix" ]; then
            printf -- '- [ ] Les alertes Dependabot correspondantes passent à `fixed` après merge\n'
            printf '\n> Si Dependabot a déjà ouvert une PR pour ce paquet, revoir et fusionner cette PR plutôt que de refaire le bump à la main, puis fermer cette issue.\n'
        else
            # No upstream fix exists, so "alerts -> fixed" is unreachable — asking
            # for it burns the loop's retry budget on a criterion no commit can
            # satisfy (observed: 3 failed attempts before human escalation).
            # The default when there is no fix is to do nothing to the code:
            # document the mitigation (criterion above), dismiss the alerts as
            # tolerable risk, and close. Dependabot re-alerts on its own if the
            # advisory changes or a fix ships, which is what re-opens this.
            printf -- '- [ ] Les alertes Dependabot correspondantes sont dismissées (`gh api -X PATCH repos/%s/dependabot/alerts/<id> -f state=dismissed -f dismissed_reason=tolerable_risk -f dismissed_comment="..."`), puis cette issue est fermée\n' "$REPO"
            printf '\n> Aucun correctif amont n'\''existe : ne pas modifier le code. Documenter la mitigation, dismiss les alertes, fermer l'\''issue. Ce script rouvrira une issue automatiquement si Dependabot relève une nouvelle alerte ou si un correctif est publié.\n'
        fi
    } >"$body"

    if [ "$SHIPYARD_SEC_DRY_RUN" != 0 ]; then
        printf '\n===== DRY RUN: %s =====\n' "$title" >&2
        cat "$body" >&2
        rm -f "$body"
        created=$((created + 1))
        continue
    fi

    if url="$("$UPSERT" "$PROJECT_NUMBER" "$PROJECT_OWNER" "$title" "$body" \
                "$SHIPYARD_SEC_LABEL" dependencies "$SHIPYARD_TODO_LABEL" 2>&1)"; then
        log "tracked $name → $url"
        created=$((created + 1))
    else
        log "WARN: could not track $name: $url"
    fi
    rm -f "$body"
done

log "$created issue(s) created"
