#!/usr/bin/env bash
# Tests de tests-planned.sh (TK-4, relecture : la couverture n'est exigée que si turbo lance des tests).
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/lib-test.sh"
SUT="$HERE/tests-planned.sh"

out() { printf '%s' "$1" | bash "$SUT" 2>/dev/null; }
is() { [ "$(out "$1" | head -1)" = "$2" ]; }
pkgs() { [ "$(out "$1" | sed -n 2p)" = "packages=$2" ]; }

echo "tests-planned.sh"
[ -f "$SUT" ] || { ko "script absent: .github/scripts/tests-planned.sh"; finish; exit $?; }

check "une tâche test planifiée -> true" is '{"tasks":[{"task":"test","command":"vitest run --coverage"}]}' planned=true
check "aucune tâche (PR racine seule) -> false" is '{"tasks":[]}' planned=false
check "sans clé tasks -> false" is '{}' planned=false
check "tâche test sans script -> false" is '{"tasks":[{"task":"test","command":"<NONEXISTENT>"}]}' planned=false
check "autres tâches seulement -> false" is '{"tasks":[{"task":"build","command":"tsc"}]}' planned=false
check "mélange -> true" is '{"tasks":[{"task":"build","command":"tsc"},{"task":"test","command":"vitest"}]}' planned=true
TWO='{"tasks":[{"task":"test","command":"vitest","directory":"packages/domain"},{"task":"build","command":"tsc","directory":"packages/ui"},{"task":"test","command":"vitest","directory":"apps/web"},{"task":"test","command":"<NONEXISTENT>","directory":"packages/ui"}]}'
check "liste les répertoires des paquets testés" pkgs "$TWO" apps/web,packages/domain
check "aucun test -> packages vide" pkgs '{"tasks":[]}' ""
fails() { ! printf '%s' "$1" | bash "$SUT"; }
check "JSON invalide -> exit != 0" fails 'nope'
finish
