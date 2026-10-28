#!/usr/bin/env bash
# Tests des images Docker (TK-16, critères 1 à 6). Réutilisable en local et en CI :
#   bash .github/scripts/docker-images.test.sh
# Les cas qui exigent Docker sont SAUTÉS (SKIP, jamais comptés comme réussis) si docker est absent.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
. "$HERE/lib-test.sh"
SKIPPED=0
skip() { SKIPPED=$((SKIPPED + 1)); echo "  - SKIP $1 ($2)"; }

TAG="koklo-tk16-test"
RUN_ID="tk16-$$"
NETWORK="net-$RUN_ID"
# `start` est appelée dans `$(…)` : une liste mise à jour là serait perdue. On nettoie donc par préfixe de nom.
cleanup() {
    docker ps -aq --filter "name=^$RUN_ID-" | xargs -r docker rm -f >/dev/null 2>&1
    docker network rm "$NETWORK" >/dev/null 2>&1
}
trap cleanup EXIT

CURL_IMAGE="curlimages/curl:8.11.1"
DF() { echo "$ROOT/apps/$1/Dockerfile"; }
dockerfile() { [ -f "$(DF "$1")" ]; }
in_df() { grep -Eq -- "$2" "$(DF "$1")" 2>/dev/null; }
from_count_ge2() { [ "$(grep -Ec '^FROM ' "$(DF "$1")" 2>/dev/null)" -ge 2 ]; }
last_user_not_root() { grep -E '^USER ' "$(DF "$1")" 2>/dev/null | tail -1 | grep -Eqv 'USER +(root|0)( |$)'; }
has_user() { grep -Eq '^USER ' "$(DF "$1")" 2>/dev/null; }
img() { echo "$TAG-$1"; }
run_sh() { docker run --rm --entrypoint sh "$(img "$1")" -c "$2"; }
have_img() { docker image inspect "$(img "$1")" >/dev/null 2>&1; }
# docker run détaché ; imprime le nom du conteneur.
start() { # start <nom> <args docker...>
    local n="$RUN_ID-$1"
    shift
    docker run -d --name "$n" "$@" >/dev/null 2>&1 && echo "$n"
}
http_code() { # http_code <conteneur> <chemin> : requête depuis le réseau docker
    docker run --rm --network "$NETWORK" "$CURL_IMAGE" -s -o /dev/null -w '%{http_code}' --max-time 3 "http://$1:3000$2" 2>/dev/null
}
wait_http() { # wait_http <conteneur> <chemin> <code>
    local i
    for i in $(seq 1 40); do
        [ "$(http_code "$1" "$2")" = "$3" ] && return 0
        sleep 1
    done
    return 1
}
ignore_has() { grep -Eq -- "$1" "$ROOT/.dockerignore" 2>/dev/null; }
api_migrates() { cat "$ROOT"/apps/api/Dockerfile "$ROOT"/apps/api/*.sh 2>/dev/null | grep -Eq 'prisma.* migrate deploy'; }
worker_no_prisma() { [ -f "$(DF worker)" ] && ! grep -qi 'prisma' "$(DF worker)"; }
ci_builds() { grep -Eq "docker build.*apps/$1/Dockerfile|apps/$1/Dockerfile" "$ROOT/.github/workflows/ci.yml"; }

echo "docker-images (TK-16)"

# --- Statique (sans docker) ---
for app in web api worker; do
    check "C1 apps/$app/Dockerfile présent" dockerfile "$app"
    check "C1 $app multi-étapes (>= 2 FROM)" from_count_ge2 "$app"
    check "C1 $app utilise turbo prune --docker" in_df "$app" 'turbo prune.*--docker'
    check "C1 $app base node:24" in_df "$app" '^FROM node:24'
    check "C6 $app finit en USER non-root" has_user "$app"
    check "C6 $app dernier USER n'est pas root" last_user_not_root "$app"
    check "C1 ci.yml construit l'image $app" ci_builds "$app"
done
check "C6 .dockerignore exclut .env*" ignore_has '^\.env'
check "C6 .dockerignore exclut node_modules" ignore_has '^node_modules'
check "C6 .dockerignore exclut .git" ignore_has '^\.git$'
check "C2 api: prisma migrate deploy dans Dockerfile/entrypoint" api_migrates
check "C3 worker: aucune mention de prisma dans le Dockerfile" worker_no_prisma

# --- Docker ---
if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
    for c in "C1 build des 3 images" "C2 api migre puis répond /health" "C2 api: DATABASE_URL invalide -> sortie non-zéro" \
        "C3 worker ne migre jamais" "C4 web /api/health = 200 sans api ni DB" "C5 promouvabilité web" "C6 hygiène des images"; do
        skip "$c" "docker indisponible (binaire absent ou démon injoignable)"
    done
    echo "$PASS passed, $FAIL failed, $SKIPPED skipped (docker absent : couverture incomplète)"
    [ "$FAIL" -eq 0 ]
    exit $?
fi

for app in web api worker; do
    check "C1 docker build apps/$app/Dockerfile (sans --build-arg)" docker build -q -f "$(DF "$app")" -t "$(img "$app")" "$ROOT"
done

docker network create "$NETWORK" >/dev/null 2>&1
PG="$(start pg --network "$NETWORK" --network-alias pg -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=koklo postgres:17-alpine)"
psql_in() { docker exec "$PG" psql -U postgres -d "${2:-koklo}" -tAc "$1" 2>/dev/null; }
pg_ready() { for _ in $(seq 1 40); do docker exec "$PG" pg_isready -U postgres -d koklo >/dev/null 2>&1 && return 0; sleep 1; done; return 1; }
check "base Postgres 17 jetable prête" pg_ready
DBURL="postgresql://postgres:pw@pg:5432/koklo"
# Variables obligatoires de l'api (loadConfig) : valeurs factices de test, aucune n'est dans l'image.
# APP_ENV=staging comme infra (APP_ENV = nom de l'environnement) : l'api doit démarrer ainsi.
API_ENV=(-e APP_ENV=staging -e BETTER_AUTH_SECRET=0123456789abcdef0123456789abcdef -e BETTER_AUTH_URL=http://localhost:3000 -e GITHUB_CLIENT_ID=test -e GITHUB_CLIENT_SECRET=test)
EXPECTED="$(find "$ROOT/packages/db/prisma/migrations" -mindepth 1 -maxdepth 1 -type d | wc -l)"

# C2
if have_img api; then
    API="$(start api --network "$NETWORK" "${API_ENV[@]}" -e DATABASE_URL="$DBURL" "$(img api)")"
    check "C2 api répond GET /health = 200" wait_http "$API" /health 200
    applied() { [ "$EXPECTED" -gt 0 ] && [ "$(psql_in 'select count(*) from _prisma_migrations where finished_at is not null')" = "$EXPECTED" ]; }
    check "C2 _prisma_migrations contient les $EXPECTED migrations du repo" applied
    bad_exit() { # DATABASE_URL invalide : sort non-zéro sans écouter
        local c code
        c="$(start apibad --network "$NETWORK" "${API_ENV[@]}" -e DATABASE_URL="postgresql://x:y@nohost:5432/none" "$(img api)")" || return 1
        code="$(timeout 90 docker wait "$c")" || return 1
        [ -n "$code" ] && [ "$code" != "0" ]
    }
    check "C2 api: DATABASE_URL invalide -> sortie non-zéro" bad_exit
else
    ko "C2 api migre puis répond (image api absente)"
fi

# C3 : base vierge dédiée, le worker ne crée rien
docker exec "$PG" psql -U postgres -c 'create database workerdb' >/dev/null 2>&1
if have_img worker; then
    start worker --network "$NETWORK" -e DATABASE_URL="postgresql://postgres:pw@pg:5432/workerdb" "$(img worker)" >/dev/null
    sleep 8
    no_migrations() { [ "$(psql_in "select count(*) from information_schema.tables where table_name='_prisma_migrations'" workerdb)" = "0" ]; }
    check "C3 worker n'a pas créé _prisma_migrations" no_migrations
    no_prisma_cmd() { ! docker inspect "$(img worker)" --format '{{json .Config.Cmd}}{{json .Config.Entrypoint}}' | grep -qi prisma; }
    check "C3 CMD/ENTRYPOINT du worker sans prisma" no_prisma_cmd
else
    ko "C3 worker ne migre jamais (image worker absente)"
fi

# C4 + C5
if have_img web; then
    W1="$(start web1 --network "$NETWORK" -e API_INTERNAL_URL="http://env-un.invalid" "$(img web)")"
    W2="$(start web2 --network "$NETWORK" -e API_INTERNAL_URL="http://env-deux.invalid" "$(img web)")"
    check "C4 web GET /api/health = 200 sans api ni DB" wait_http "$W1" /api/health 200
    body_ok() { docker run --rm --network "$NETWORK" "$CURL_IMAGE" -s "http://$1:3000/api/health" | grep -Eq '"status" *: *"ok"'; }
    check "C4 corps { status: ok }" body_ok "$W1"
    check "C5 même image, autre environnement = 200" wait_http "$W2" /api/health 200
    no_env_urls() { ! run_sh web 'grep -rEl "env-un\.invalid|env-deux\.invalid|NEXT_PUBLIC_" /app --include=*.js --include=*.json --include=*.html 2>/dev/null | grep -v node_modules | grep -q .'; }
    check "C5 aucune URL d'environnement ni NEXT_PUBLIC_ figée dans l'image" no_env_urls
else
    ko "C4 web /api/health (image web absente)"
    ko "C5 promouvabilité web (image web absente)"
fi

# C6
non_root() { [ "$(docker run --rm --entrypoint id "$(img "$1")" -u)" != 0 ]; }
no_env() { ! run_sh "$1" 'find /app /home /srv /opt -name ".env*" -not -path "*/node_modules/*" 2>/dev/null | grep -q .'; }
no_tests() { ! run_sh "$1" 'find /app /home /srv /opt \( -name "*.test.ts" -o -name "*.test.tsx" -o -name "*.spec.ts" \) -not -path "*/node_modules/*" 2>/dev/null | grep -q .'; }
for app in web api worker; do
    if have_img "$app"; then
        check "C6 $app: utilisateur non-root" non_root "$app"
        check "C6 $app: aucun .env dans l'image" no_env "$app"
        check "C6 $app: aucune source de test dans l'image" no_tests "$app"
    else
        ko "C6 $app hygiène (image absente)"
    fi
done

echo "$PASS passed, $FAIL failed, $SKIPPED skipped"
[ "$FAIL" -eq 0 ]
