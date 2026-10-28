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

e2e_block() { job_block e2e; }
in_e2e() { e2e_block | grep -Eq -- "$1"; }
# Rang de la première ligne du job e2e qui correspond.
e2e_rank() { e2e_block | grep -nE -- "$1" | head -1 | cut -d: -f1; }
e2e_before() {
    local a b
    a="$(e2e_rank "$1")"
    b="$(e2e_rank "$2")"
    [ -n "$a" ] && [ -n "$b" ] && [ "$a" -lt "$b" ]
}
e2e_no_secrets() { [ -n "$(e2e_block)" ] && ! e2e_block | grep -Eq 'secrets\.'; }
e2e_pinned() { [ -n "$(e2e_block)" ] && ! e2e_block | grep -E 'uses:' | grep -vE '@v[0-9]+\.[0-9]+\.[0-9]+' | grep -q .; }

ci_accepts_e2e_skipped() { ! job_block ci | grep -Eq "needs\\.e2e\\.result != 'success'"; }

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
check "couverture: --require-reports" g -- 'check-coverage\.sh --require-reports'
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

# TK-15 : job e2e (Playwright sur le vrai stack)
check "job e2e présent" g '^  e2e:'
check "e2e: dépend de changes" in_e2e 'needs:.*changes'
check "e2e: déclenché par outputs.code" in_e2e "needs\.changes\.outputs\.code == 'true'"
check "e2e: checkout épinglé" in_e2e 'actions/checkout@v7\.0\.1'
check "e2e: pnpm/action-setup épinglé" in_e2e 'pnpm/action-setup@v6\.1\.0'
check "e2e: setup-node épinglé" in_e2e 'actions/setup-node@v7\.1\.0'
check "e2e: install --frozen-lockfile" in_e2e 'pnpm install --frozen-lockfile'
check "e2e: installation du navigateur Playwright" in_e2e 'playwright install'
check "e2e: lance pnpm e2e" in_e2e 'pnpm e2e'
check "e2e: ordre install < navigateur" e2e_before 'pnpm install' 'playwright install'
check "e2e: ordre navigateur < pnpm e2e" e2e_before 'playwright install' 'pnpm e2e'
check "e2e: upload du rapport en cas d'échec" in_e2e 'actions/upload-artifact@v[0-9]+\.[0-9]+\.[0-9]+'
check "e2e: upload conditionné par failure() ou always()" in_e2e 'if: (failure|always)\(\)'
check "e2e: actions épinglées" e2e_pinned
check "e2e: aucun secret réel (secrets.*)" e2e_no_secrets
check "job ci agrège e2e (needs)" in_ci 'needs:.*e2e'
check "job ci : échec si e2e est en failure ou cancelled" in_ci "needs\\.e2e\\.result == 'failure' \\|\\| needs\\.e2e\\.result == 'cancelled'"
check "job ci : e2e skipped reste accepté (pas de garde != 'success')" ci_accepts_e2e_skipped
check "job ci conserve son nom stable" g '^  ci:'

# TK-16 : build des 3 images Docker, sans publication
in_images() { job_block images | grep -Eq -- "$1"; }
images_present() { [ -n "$(job_block images)" ]; }
images_lacks() { images_present && ! job_block images | grep -Eq -- "$1"; }
images_unpinned_action() { job_block images | grep -E 'uses:' | grep -vE '@v[0-9]+\.[0-9]+\.[0-9]+' | grep -q .; }
check "images: job présent" g '^  images:'
for a in web api worker; do
    check "images: docker build apps/$a/Dockerfile" in_images "docker build.*apps/$a/Dockerfile"
done
check "images: aucun --build-arg" images_lacks -- '--build-arg'
check "images: ni push ni secret" images_lacks 'push|ghcr|secrets\.'
check "job ci agrège images (needs)" in_ci 'needs:.*images'
check "images: actions épinglées" bash -c "$(declare -f job_block images_present images_unpinned_action); WF='$WF'; images_present && ! images_unpinned_action"
finish
