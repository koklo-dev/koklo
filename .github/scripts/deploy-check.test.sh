#!/usr/bin/env bash
# Tests du wrapper `pnpm deploy:check` (TK-17, critères 1 à 4 et 8).
# Contrat : scripts/deploy-check.sh [manifest] (défaut .deploy/manifest.yaml) valide le manifest avec
# $INFRA_DIR/scripts/validate-manifest.py ; sortie 0 si valide (« ✓ <chemin> »), non nulle sinon.
# Les cas qui exigent le vrai validateur d'infra (INFRA_DIR + python3 jsonschema/PyYAML) sont SAUTÉS
# (SKIP, jamais comptés comme réussis) si l'outil est absent.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
. "$HERE/lib-test.sh"
SKIPPED=0
skip() { SKIPPED=$((SKIPPED + 1)); echo "  - SKIP $1 ($2)"; }

SUT="$ROOT/scripts/deploy-check.sh"
REAL_MANIFEST="$ROOT/.deploy/manifest.yaml"
INFRA="${INFRA_DIR:-$HOME/perso/projets/infra}"
TMP="$(mktemp -d)"
trap 'find "$TMP" -delete' EXIT

# Manifest minimal valide (mode services), dérivé de examples/sample-services d'infra.
write_base() { # write_base <fichier>
    cat >"$1" <<'YAML'
apiVersion: deploy/v1
name: fixture
server: vps20
mode: services
secrets: [ADMIN_EMAIL]
apps:
  web:
    image: ghcr.io/koklo-dev/fixture-web
    port: 3000
    domain: web
    uses: [api]
  api:
    image: ghcr.io/koklo-dev/fixture-api
    port: 3000
    domain: api
    uses: [db, files, mail]
workers:
  jobs:
    image: ghcr.io/koklo-dev/fixture-worker
    uses: [db]
databases:
  db: { type: postgres, version: 17-alpine, database: fixture, user: fixture }
buckets:
  files: {}
mail: {}
environments:
  production:
    branch: main
    deploy: manual
    domains: { web: fixture.example.com, api: fixture-api.example.com }
  staging:
    branch: develop
    domains: { web: fixture-staging.example.com, api: fixture-api-staging.example.com }
YAML
}
variant() { # variant <nom> <expression sed> : copie de la base modifiée
    write_base "$TMP/$1.yaml"
    sed -i -E "$2" "$TMP/$1.yaml"
}

have_wrapper() { [ -f "$SUT" ]; }
have_validator() { [ -f "$INFRA/scripts/validate-manifest.py" ] && python3 -c 'import jsonschema, yaml' 2>/dev/null; }
# run <env...> -- <args> : exécute le wrapper, stdout+stderr dans $OUT, code dans $RC
run() {
    local envs=()
    while [ "$1" != "--" ]; do envs+=("$1"); shift; done
    shift
    OUT="$(env "${envs[@]}" bash "$SUT" "$@" 2>&1)"
    RC=$?
}
# Échec attendu : le wrapper existe, sort non nul et son message contient le motif.
fails_with() { # fails_with <motif> <env...> -- <args>
    local pat="$1"
    shift
    have_wrapper || return 1
    run "$@"
    [ "$RC" -ne 0 ] && [ "$RC" -ne 127 ] && printf '%s' "$OUT" | grep -Eiq -- "$pat"
}
passes_with() { # passes_with <motif> <env...> -- <args>
    local pat="$1"
    shift
    have_wrapper || return 1
    run "$@"
    [ "$RC" -eq 0 ] && printf '%s' "$OUT" | grep -Fq -- "$pat"
}

echo "deploy-check (TK-17)"

# --- Statique ---
check "wrapper présent: scripts/deploy-check.sh" have_wrapper
check "package.json expose le script deploy:check" grep -Eq '"deploy:check" *: *"[^"]*deploy-check' "$ROOT/package.json"

# C1/C8 : le vrai manifest (statique, sans Python)
m() { grep -Eq -- "$1" "$REAL_MANIFEST" 2>/dev/null; }
check "C8 manifest présent: .deploy/manifest.yaml" test -f "$REAL_MANIFEST"
check "C8 apiVersion deploy/v1" m '^apiVersion: deploy/v1'
check "C8 name koklo" m '^name: koklo$'
for c in web api worker; do
    check "C8 image ghcr.io/koklo-dev/koklo-$c" m "ghcr\.io/koklo-dev/koklo-$c"
done
check "C8 postgres 17-alpine" m '17-alpine'
check "C8 bucket files" m '^buckets:'
check "C8 mail" m '^mail:'
check "C8 environnements staging et production" bash -c "grep -Eq '^  staging:' '$REAL_MANIFEST' && grep -Eq '^  production:' '$REAL_MANIFEST'"
check "C8 port 3000" m 'port: 3000'
check "C8 healthcheck web /api/health" m 'healthcheck:.*/api/health'
check "C8 healthcheck api /health" m 'healthcheck:.*[^i]/health'

# --- C3 : infra introuvable -> échec explicite (aucune dépendance Python requise) ---
write_base "$TMP/valid.yaml"
check "C3 INFRA_DIR inexistant -> échec avec message INFRA_DIR" fails_with 'INFRA_DIR' INFRA_DIR="$TMP/absent" -- "$TMP/valid.yaml"
mkdir -p "$TMP/empty-infra"
check "C3 INFRA_DIR sans scripts/validate-manifest.py -> échec explicite" fails_with 'validate-manifest' INFRA_DIR="$TMP/empty-infra" -- "$TMP/valid.yaml"
mkdir -p "$TMP/home"
check "C3 INFRA_DIR non défini et défaut absent -> échec explicite" fails_with 'INFRA_DIR' -u INFRA_DIR HOME="$TMP/home" -- "$TMP/valid.yaml"

# --- C4 : dépendances Python absentes -> message clair (python3 factice qui échoue à l'import) ---
mkdir -p "$TMP/fake-infra/scripts" "$TMP/nopy"
printf 'import jsonschema\n' >"$TMP/fake-infra/scripts/validate-manifest.py"
cat >"$TMP/nopy/python3" <<'SH'
#!/bin/sh
echo "ModuleNotFoundError: No module named 'jsonschema'" >&2
exit 1
SH
chmod +x "$TMP/nopy/python3"
check "C4 jsonschema/PyYAML absents -> échec, message pip install" fails_with 'pip install|jsonschema.*PyYAML|PyYAML.*jsonschema' INFRA_DIR="$TMP/fake-infra" PATH="$TMP/nopy:$PATH" -- "$TMP/valid.yaml"

# --- Cas qui exigent le vrai validateur d'infra ---
if have_validator; then
    export INFRA_DIR="$INFRA"
    # C1
    check "C1 manifest valide -> exit 0 et ✓ <chemin>" passes_with "✓ $TMP/valid.yaml" -- "$TMP/valid.yaml"
    check "C1 manifest du dépôt -> exit 0 et ✓ .deploy/manifest.yaml" bash -c "cd '$ROOT' && out=\$(INFRA_DIR='$INFRA' bash scripts/deploy-check.sh 2>&1) && printf '%s' \"\$out\" | grep -Fq '✓ .deploy/manifest.yaml'"
    # C2 : un cas invalide par motif
    variant uses 's/uses: \[api\]/uses: [ghost]/'
    check "C2 uses inconnu -> échec lisible" fails_with "unknown component 'ghost'" -- "$TMP/uses.yaml"
    variant domain 's/domain: api$/domain: nowhere/'
    check "C2 domaine absent d'un environnement -> échec lisible" fails_with "missing in environments" -- "$TMP/domain.yaml"
    variant secret 's/^secrets: \[ADMIN_EMAIL\]/secrets: [ADMIN_EMAIL, GITHUB_TOKEN]/'
    check "C2 secret réservé GITHUB_TOKEN -> échec lisible" fails_with "GITHUB_TOKEN.*platform credential" -- "$TMP/secret.yaml"
    variant extra 's/^name: fixture/name: fixture\nchampInconnu: 1/'
    check "C2 champ hors schéma -> échec lisible" fails_with "additional properties|champInconnu" -- "$TMP/extra.yaml"
    check "C2 fichier manifest inexistant -> échec" fails_with '.' -- "$TMP/nope.yaml"
else
    for c in "C1 manifest valide" "C1 manifest du dépôt" "C2 uses inconnu" "C2 domaine manquant" "C2 secret réservé" "C2 champ hors schéma" "C2 fichier inexistant"; do
        skip "$c" "INFRA_DIR ($INFRA) ou python3 jsonschema/PyYAML absent"
    done
fi

echo "$SKIPPED skipped"
finish
