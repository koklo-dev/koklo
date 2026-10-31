#!/usr/bin/env bash
# Tests du manifest de déploiement (TK-47) : les secrets de l'App GitHub sont obligatoires.
# Contrat : GH_APP_ID, GH_APP_PRIVATE_KEY, GH_WEBHOOK_SECRET sont dans `secrets` (et plus dans
# `optionalSecrets`) ; GH_APP_CLIENT_ID/GH_APP_CLIENT_SECRET et SENTRY_DSN restent facultatifs
# (hotfix #69 : flux jeton utilisateur absent -> USER_TOKEN_REQUIRED) ; le mappage vers
# GITHUB_APP_* / GITHUB_WEBHOOK_SECRET (api, worker) est conservé. Aucune valeur de secret n'est lue.
# Le cas final exige le vrai validateur d'infra (SKIP, jamais compté comme réussi, s'il est absent).
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
. "$HERE/lib-test.sh"

MANIFEST="${MANIFEST:-$ROOT/.deploy/manifest.yaml}"
INFRA="${INFRA_DIR:-$HOME/perso/projets/infra}"

# list_of <clé> : noms (un par ligne) de la liste de premier niveau `<clé>: [A, B]` (sans commentaire).
list_of() {
    sed -nE "s/^$1:[[:space:]]*\[([^]]*)\].*/\1/p" "$MANIFEST" | tr ',' '\n' | tr -d ' '
}
occurs_twice() { [ "$(grep -oF -- "$1" "$MANIFEST" | wc -l)" -ge 2 ]; } # api ET worker
in_list() { list_of "$1" | grep -Fxq "$2"; } # in_list <clé> <nom>

echo "manifest secrets (TK-47)"
check "manifest présent" test -f "$MANIFEST"
for n in GH_APP_ID GH_APP_PRIVATE_KEY GH_WEBHOOK_SECRET; do
    check "$n est dans secrets" in_list secrets "$n"
    check "$n n'est plus dans optionalSecrets" bash -c "$(declare -f list_of in_list); MANIFEST='$MANIFEST'; ! in_list optionalSecrets '$n'"
done
for n in GH_APP_CLIENT_ID GH_APP_CLIENT_SECRET SENTRY_DSN; do
    check "$n reste dans optionalSecrets" in_list optionalSecrets "$n"
    check "$n n'est pas dans secrets" bash -c "$(declare -f list_of in_list); MANIFEST='$MANIFEST'; ! in_list secrets '$n'"
done
check "secrets OAuth existants conservés" bash -c "$(declare -f list_of in_list); MANIFEST='$MANIFEST'; in_list secrets OAUTH_GITHUB_CLIENT_ID && in_list secrets OAUTH_GITHUB_CLIENT_SECRET"
for m in "GITHUB_APP_ID: '\${secrets.GH_APP_ID}'" "GITHUB_APP_PRIVATE_KEY: '\${secrets.GH_APP_PRIVATE_KEY}'" "GITHUB_WEBHOOK_SECRET: '\${secrets.GH_WEBHOOK_SECRET}'"; do
    check "mappage api+worker : $m" occurs_twice "$m"
done
check "mappage api : GITHUB_APP_CLIENT_* conservé" grep -Fq "GITHUB_APP_CLIENT_ID: '\${secrets.GH_APP_CLIENT_ID}'" "$MANIFEST"

if [ -f "$INFRA/scripts/validate-manifest.py" ] && python3 -c 'import jsonschema, yaml' 2>/dev/null; then
    check "deploy:check vert sur le manifest" bash -c "cd '$ROOT' && INFRA_DIR='$INFRA' bash scripts/deploy-check.sh '$MANIFEST'"
else
    echo "  - SKIP deploy:check (INFRA_DIR ou python3 jsonschema/PyYAML absent)"
fi
finish
