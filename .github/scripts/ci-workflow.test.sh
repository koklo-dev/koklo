#!/usr/bin/env bash
# Tests structurels de .github/workflows/ci.yml (TK-4, critères 1 à 3).
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/lib-test.sh"
WF="$HERE/../workflows/ci.yml"

echo "ci.yml"
[ -f "$WF" ] || { ko "absent: .github/workflows/ci.yml"; finish; exit $?; }

g() { grep -Eq -- "$1" "$WF"; }
# Bloc d'un job de premier niveau (entre "  <job>:" et le job suivant).
job_block() {
    awk -v j="$1" '$0 ~ ("^  " j ":") {on=1; next} on && /^  [A-Za-z0-9_-]+:/ {on=0} on' "$WF"
}
in_ci() { job_block ci | grep -Eq -- "$1"; }
job_if_always() { job_block ci | grep -Eq '^    if: always\(\)'; }
guard_fails() { job_block ci | grep -Eq "needs\.changes\.result != 'success'"; }
# Le garde doit précéder toute autre étape (le premier "- " du bloc steps).
guard_first() { job_block ci | awk '/^    steps:/ {on=1; next} on && /^      - / {print; exit}' | grep -q 'Change detection succeeded'; }
# Rang de la première ligne du job ci qui correspond.
rank() { job_block ci | grep -nE -- "$1" | head -1 | cut -d: -f1; }
before() {
    local a b
    a="$(rank "$1")"
    b="$(rank "$2")"
    [ -n "$a" ] && [ -n "$b" ] && [ "$a" -lt "$b" ]
}
unpinned() { grep -E 'uses:' "$WF" | grep -vE '@v[0-9]+\.[0-9]+\.[0-9]+'; }
no_unpinned() { ! unpinned | grep -q .; }

# T1.3
check "checkout v7.0.1" g 'actions/checkout@v7\.0\.1'
check "pnpm/action-setup v6.1.0" g 'pnpm/action-setup@v6\.1\.0'
check "setup-node v7.1.0" g 'actions/setup-node@v7\.1\.0'
check "aucune action non épinglée" no_unpinned
check "permissions contents: read" g '^  contents: read'
# jobs
check "job changes" g '^  changes:'
check "job ci (nom stable)" g '^  ci:'
check "job 'skills in sync'" g 'name: skills in sync'
check "job 'ci scripts'" g 'name: ci scripts'
check "skills-sync-gate.sh appelé" g 'skills-sync-gate\.sh'
check "skills-sync-gate.sh présent" test -f "$HERE/skills-sync-gate.sh"
# T1.1
check "ci: install" in_ci 'pnpm install --frozen-lockfile'
check "ci: lint" in_ci 'pnpm lint'
check "ci: typecheck" in_ci 'typecheck'
check "ci: test" in_ci 'turbo run .*test|pnpm test'
check "ci: build" in_ci 'turbo run .*build|pnpm build'
check "ordre install < lint" before 'pnpm install' 'pnpm lint'
check "ordre lint < typecheck" before 'pnpm lint' 'typecheck'
check "ordre typecheck < test" before 'typecheck' 'turbo run .*test|pnpm test'
check "ordre test < couverture" before 'turbo run .*test|pnpm test' 'check-coverage\.sh'
check "ordre couverture < build" before 'check-coverage\.sh' 'turbo run .*build|pnpm build'
# T2.5
check "couverture: --require-reports" g "'--require-reports'"
check "couverture: exigée seulement si des tests sont planifiés" g 'PLANNED: .*steps\.plan\.outputs\.planned'
check "couverture: un rapport par paquet testé (--expect)" g -- '--expect "\$PACKAGES"'
check "tests-planned.sh appelé" g 'tests-planned\.sh'
check "tests-planned.sh présent" test -f "$HERE/tests-planned.sh"
check "ordre plan < test" before 'tests-planned\.sh' 'turbo run test \$TURBO_ARGS$'
# T3.5 / T3.6
check "--affected" g -- '--affected'
check "detect-changes.sh appelé" g 'detect-changes\.sh'
check "fetch-depth: 0 pour le diff" g 'fetch-depth: 0'
check "garde sur outputs.skills" g 'needs\.changes\.outputs\.skills'
check "garde sur outputs.ci" g 'needs\.changes\.outputs\.ci'
check "garde sur outputs.code" g 'needs\.changes\.outputs\.code'
check "job ci dépend de changes" in_ci 'needs:.*changes'
check "job ci : if: always() (jamais sauté si changes échoue)" job_if_always
check "job ci : échec explicite si changes n'est pas success" guard_fails
check "job ci : le garde est la première étape" guard_first
check "couche agent vérifiée" g 'loop\.tickets'
finish
