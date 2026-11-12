#!/usr/bin/env bash
# Tests de tests-planned.sh (TK-4, relecture : la couverture n'est exigée que si turbo lance des tests).
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/lib-test.sh"
SUT="$HERE/tests-planned.sh"

out() { printf "%s" "$1" | bash "$SUT" "${@:2}" 2>/dev/null; }
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
# Lots de la CI : --only / --except et sortie filters.
PKGS='{"tasks":[{"task":"test","command":"vitest","package":"@koklo/api","directory":"apps/api"},{"task":"test","command":"vitest","package":"@koklo/web","directory":"apps/web"},{"task":"test","command":"vitest","package":"@koklo/db","directory":"packages/db"},{"task":"test","command":"vitest","package":"@koklo/ui","directory":"packages/ui"},{"task":"test","command":"<NONEXISTENT>","package":"@koklo/e2e","directory":"e2e"}]}'
# line <json> <n° de ligne> <attendu> [arguments du script…]
line() { [ "$(out "$1" "${@:4}" | sed -n "$2"p)" = "$3" ]; }
check "filters : un --filter par paquet testé" line "$PKGS" 3 "filters=--filter=@koklo/api --filter=@koklo/db --filter=@koklo/ui --filter=@koklo/web"
check "--only garde les paquets nommés" line "$PKGS" 2 "packages=apps/api" --only @koklo/api
check "--only plusieurs paquets" line "$PKGS" 3 "filters=--filter=@koklo/db --filter=@koklo/web" --only @koklo/web,@koklo/db
check "--except garde tous les autres" line "$PKGS" 2 "packages=packages/ui" --except @koklo/api,@koklo/web,@koklo/db
check "--only sans paquet planifié -> planned=false" line "$PKGS" 1 "planned=false" --only @koklo/inconnu
fails() { ! printf '%s' "$1" | bash "$SUT"; }
check "JSON invalide -> exit != 0" fails 'nope'
finish
