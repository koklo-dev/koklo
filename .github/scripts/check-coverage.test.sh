#!/usr/bin/env bash
# Tests de check-coverage.sh (TK-4, critère 2 : couverture sous les seuils §19.2 => échec).
# Contrat : check-coverage.sh [--require-reports] <racine>
# Lit <racine>/{apps,packages}/*/coverage/coverage-summary.json (Vitest json-summary).
# Seuils : lignes >= 80 %, branches >= 70 % (agrégés) ; branches >= 90 % pour domain et delivery.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/lib-test.sh"
SUT="$HERE/check-coverage.sh"
FX="$HERE/../fixtures/coverage"

passes() { bash "$SUT" "$@"; }
fails() { ! bash "$SUT" "$@"; }
msg_has() {
    local re="$1"
    shift
    local output
    output="$(bash "$SUT" "$@" 2>&1)" # capturé d'abord : sous pipefail, le code 1 attendu du SUT fausserait le pipe
    grep -Eiq "$re" <<<"$output"
}

echo "check-coverage.sh"
[ -f "$SUT" ] || { ko "script absent: .github/scripts/check-coverage.sh"; finish; exit $?; }

# T2.1
check "ok -> exit 0" passes "$FX/ok"
check "ok --require-reports -> exit 0" passes --require-reports "$FX/ok"
# T2.2 seuils globaux
check "below -> exit != 0" fails "$FX/below"
check "below -> message cite lignes" msg_has 'lines|lignes' "$FX/below"
check "below -> message cite branches" msg_has 'branches' "$FX/below"
check "below -> message cite le seuil 80" msg_has '80' "$FX/below"
# T2.3 seuil 90 % de branches
check "domain 80% branches -> exit != 0" fails "$FX/below-domain"
check "domain -> message nomme le paquet et 90" msg_has 'domain.*90|90.*domain' "$FX/below-domain"
check "delivery 85% branches -> exit != 0" fails "$FX/below-delivery"
check "delivery -> message nomme le paquet" msg_has 'delivery' "$FX/below-delivery"
# T2.4 --require-reports
check "aucun rapport + --require-reports -> exit != 0" fails --require-reports "$FX/empty"
check "aucun rapport sans option -> exit 0" passes "$FX/empty"
check "racine inexistante -> exit != 0" fails "$FX/does-not-exist"
finish
