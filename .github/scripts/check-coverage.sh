#!/usr/bin/env bash
# Gate de couverture (CDC §19.2). Usage : check-coverage.sh [--require-reports] [--expect dir,dir] <racine>
# --expect : paquets dont les tests sont planifiés (sortie de tests-planned.sh) ; chacun doit
# avoir produit un coverage-summary.json, sinon échec.
#
# Lit les coverage/coverage-summary.json de <racine>/apps/* et <racine>/packages/*
# (Vitest, reporter json-summary).
# Seuils bloquants : lignes >= 80 % et branches >= 70 % (agrégés sur les paquets),
# branches >= 90 % pour packages/domain et packages/delivery.
# Le seuil « 90 % sur le code nouveau » n'est pas vérifié ici (il demande un diff-cover).
set -uo pipefail
export LC_ALL=C # séparateur décimal stable dans les messages

LINES_MIN=80
BRANCHES_MIN=70
STRICT_BRANCHES_MIN=90
STRICT_PACKAGES="packages/domain packages/delivery"

require=false
expect=""
while [ $# -gt 0 ]; do
    case "$1" in
    --require-reports) require=true ;;
    --expect)
        shift
        expect="${1:-}"
        ;;
    *) break ;;
    esac
    shift
done
ROOT="${1:-.}"
[ -d "$ROOT" ] || { echo "check-coverage: no such directory: $ROOT" >&2; exit 2; }
command -v jq >/dev/null || { echo "check-coverage: jq is required" >&2; exit 2; }

shopt -s nullglob
reports=("$ROOT"/apps/*/coverage/coverage-summary.json "$ROOT"/packages/*/coverage/coverage-summary.json)

if [ "${#reports[@]}" -eq 0 ]; then
    if $require || [ -n "$expect" ]; then
        echo "✗ no coverage-summary.json found under $ROOT (apps/*, packages/*)" >&2
        exit 1
    fi
    echo "check-coverage: no coverage report, nothing to check"
    exit 0
fi

fail=0
IFS=',' read -r -a expected <<<"$expect"
for pkg in "${expected[@]}"; do
    [ -n "$pkg" ] || continue
    if [ ! -f "$ROOT/$pkg/coverage/coverage-summary.json" ]; then
        echo "✗ $pkg runs tests but produced no coverage-summary.json" >&2
        fail=1
    fi
done
# below <covered> <total> <min> : vrai si la couverture est strictement sous le seuil.
below() { awk -v c="$1" -v t="$2" -v m="$3" 'BEGIN { exit !(t > 0 && c * 100 < m * t) }'; }
pct() { awk -v c="$1" -v t="$2" 'BEGIN { printf "%.2f", (t > 0) ? c * 100 / t : 100 }'; }

sums="$(jq -s -r '[.[].total] | [
        (map(.lines.covered) | add), (map(.lines.total) | add),
        (map(.branches.covered) | add), (map(.branches.total) | add)] | @tsv' "${reports[@]}")" || exit 2
read -r lc lt bc bt <<<"$sums"

if below "$lc" "$lt" "$LINES_MIN"; then
    echo "✗ lines coverage $(pct "$lc" "$lt")% is below the ${LINES_MIN}% threshold (global)" >&2
    fail=1
fi
if below "$bc" "$bt" "$BRANCHES_MIN"; then
    echo "✗ branches coverage $(pct "$bc" "$bt")% is below the ${BRANCHES_MIN}% threshold (global)" >&2
    fail=1
fi

for pkg in $STRICT_PACKAGES; do
    report="$ROOT/$pkg/coverage/coverage-summary.json"
    [ -f "$report" ] || continue
    read -r c t < <(jq -r '.total.branches | [.covered, .total] | @tsv' "$report")
    if below "$c" "$t" "$STRICT_BRANCHES_MIN"; then
        echo "✗ $pkg branches coverage $(pct "$c" "$t")% is below the ${STRICT_BRANCHES_MIN}% threshold" >&2
        fail=1
    fi
done

if [ "$fail" -eq 0 ]; then
    echo "✅ coverage thresholds met: lines $(pct "$lc" "$lt")%, branches $(pct "$bc" "$bt")% (${#reports[@]} report(s))"
fi
exit "$fail"
