#!/usr/bin/env bash
# Tests structurels de .github/workflows/ci.yml (TK-4, critères 1 à 3).
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/lib-test.sh"
WF="$HERE/../workflows/ci.yml"

echo "ci.yml"
[ -f "$WF" ] || { ko "absent: .github/workflows/ci.yml"; finish; exit $?; }

g() { grep -Eq -- "$1" "$WF"; }
in_ci() { job_block ci | grep -Eq -- "$1"; }
job_if_always() { job_block ci | grep -Eq '^    if: always\(\)'; }
guard_fails() { job_block ci | grep -Eq "needs\.changes\.result != 'success'"; }
# Le garde doit précéder toute autre étape (le premier "- " du bloc steps).
guard_first() {
    local first
    first="$(job_block ci | awk '/^    steps:/ {on=1; next} on && /^      - / && !seen {print; seen=1}')"
    case "$first" in *'Change detection succeeded'*) return 0 ;; *) return 1 ;; esac
}
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
check "pnpm/action-setup v6.1.1" g 'pnpm/action-setup@v6\.1\.1'
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
# Jobs de la CI découpée : `checks` (lint, typecheck, build), `tests` (matrice de lots), `coverage`.
blk() { job_block "$1"; }
in_job() { local j="$1"; shift; blk "$j" | grep -Eq -- "$1"; }
jrank() { blk "$1" | grep -nE -- "$2" | head -1 | cut -d: -f1; }
jbefore() {
    local a b
    a="$(jrank "$1" "$2")"
    b="$(jrank "$1" "$3")"
    [ -n "$a" ] && [ -n "$b" ] && [ "$a" -lt "$b" ]
}
# T1.1 : lint, typecheck, build dans `checks` ; tests dans `tests` ; seuils dans `coverage`
check "job checks" g '^  checks:'
check "job tests" g '^  tests:'
check "job coverage" g '^  coverage:'
check "checks: install" in_job checks 'pnpm install --frozen-lockfile'
check "checks: lint" in_job checks 'pnpm lint'
check "checks: typecheck" in_job checks 'typecheck'
check "checks: build" in_job checks 'turbo run .*build|pnpm build'
check "checks: ordre install < lint" jbefore checks 'pnpm install' 'pnpm lint'
check "checks: ordre lint < typecheck" jbefore checks 'pnpm lint' 'turbo run typecheck'
check "checks: ordre typecheck < build" jbefore checks 'turbo run typecheck' 'turbo run .*build'
check "checks: dépend de changes, déclenché par outputs.code" in_job checks "needs\.changes\.outputs\.code == 'true'"
check "tests: dépend de changes, déclenché par outputs.code" in_job tests "needs\.changes\.outputs\.code == 'true'"
check "tests: install" in_job tests 'pnpm install --frozen-lockfile'
check "tests: turbo run test" in_job tests 'turbo run test'
check "tests: matrice sans fail-fast (chaque lot va au bout)" in_job tests 'fail-fast: false'
for lot in api web worker-db other; do
    check "tests: lot $lot" in_job tests "name: $lot"
done
check "tests: le lot 'other' prend tout le reste (--except)" in_job tests -- '--except @koklo/api'
check "tests: Postgres partagé postgres:17-alpine" in_job tests 'postgres:17-alpine'
check "tests: TEST_DATABASE_URL défini pour les lots d'intégration" in_job tests 'TEST_DATABASE_URL:'
check "tests: Postgres démarré avant les tests" jbefore tests 'Start Postgres' 'turbo run test \$FILTERS'
check "tests: ordre plan < test" jbefore tests 'tests-planned\.sh' 'turbo run test \$FILTERS'
check "tests: --affected sur PR" in_job tests -- '--affected'
check "tests: publie les rapports de chaque lot" in_job tests 'actions/upload-artifact@v[0-9]+\.[0-9]+\.[0-9]+'
check "turbo transmet TEST_DATABASE_URL aux tests (mode strict)" grep -q '"TEST_DATABASE_URL"' "$HERE/../../turbo.json"
check "coverage: dépend de tests" in_job coverage 'needs:.*tests'
check "coverage: télécharge les rapports des lots" in_job coverage 'actions/download-artifact@v[0-9]+\.[0-9]+\.[0-9]+'
check "coverage: ordre fusion < seuils" jbefore coverage 'Merge coverage' 'check-coverage\.sh'
check "job ci agrège checks (needs)" in_ci 'needs:.*checks'
check "job ci agrège tests (needs)" in_ci 'needs:.*tests'
check "job ci agrège coverage (needs)" in_ci 'needs:.*coverage'
check "job ci : échec si checks est en failure ou cancelled" in_ci "needs\\.checks\\.result == 'failure' \\|\\| needs\\.checks\\.result == 'cancelled'"
check "job ci : échec si tests est en failure ou cancelled" in_ci "needs\\.tests\\.result == 'failure' \\|\\| needs\\.tests\\.result == 'cancelled'"
check "job ci : échec si coverage est en failure ou cancelled" in_ci "needs\\.coverage\\.result == 'failure' \\|\\| needs\\.coverage\\.result == 'cancelled'"
ci_accepts_new_skipped() { ! job_block ci | grep -Eq "needs\\.(checks|tests|coverage)\\.result != 'success'"; }
ci_is_light() { ! job_block ci | grep -Ev '^ *#' | grep -Eq 'pnpm|turbo'; }
check "job ci : checks/tests/coverage skipped acceptés (pas de garde != 'success')" ci_accepts_new_skipped
check "job ci : léger (ni pnpm ni turbo)" ci_is_light
# T2.5
check "couverture: --require-reports" g -- 'check-coverage\.sh --require-reports'
check "couverture: un rapport par paquet testé (--expect)" g -- '--expect "\$PACKAGES"'
check "tests-planned.sh appelé" g 'tests-planned\.sh'
check "tests-planned.sh présent" test -f "$HERE/tests-planned.sh"
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
check "e2e: pnpm/action-setup épinglé" in_e2e 'pnpm/action-setup@v6\.1\.1'
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

# TK-17 : job deploy-check (valide .deploy/manifest.yaml avec le validateur d'infra, épinglé)
dc_block() { job_block deploy-check; }
in_dc() { dc_block | grep -Eq -- "$1"; }
dc_present() { [ -n "$(dc_block)" ]; }
dc_lacks() { dc_present && ! dc_block | grep -Eq -- "$1"; }
dc_unpinned_action() { dc_block | grep -E 'uses:' | grep -vE '@v[0-9]+\.[0-9]+\.[0-9]+' | grep -q .; }
dc_actions_pinned() { dc_present && ! dc_unpinned_action; }
infra_checkout_sha() { dc_block | grep -Eq 'repository: josias-koffi/infra' && dc_block | grep -Eq 'ref: [0-9a-f]{40}( |$)'; }
dc_rank() { dc_block | grep -nE -- "$1" | head -1 | cut -d: -f1; }
dc_before() {
    local a b
    a="$(dc_rank "$1")"
    b="$(dc_rank "$2")"
    [ -n "$a" ] && [ -n "$b" ] && [ "$a" -lt "$b" ]
}
changes_exposes_deploy() { job_block changes | grep -Eq 'deploy: \$\{\{ steps\.detect\.outputs\.deploy \}\}'; }
push_sets_deploy() { job_block changes | grep -Eq "printf 'code=true.*deploy=true"; }
ci_accepts_deploy_skipped() { ! job_block ci | grep -Eq "needs\\.deploy-check\\.result != 'success'"; }
check "deploy-check: job présent" g '^  deploy-check:'
check "changes expose la sortie deploy" changes_exposes_deploy
check "changes: sur push, deploy=true (comme les autres sorties)" push_sets_deploy
check "deploy-check: dépend de changes" in_dc 'needs:.*changes'
check "deploy-check: déclenché seulement par outputs.deploy" in_dc "if: needs\.changes\.outputs\.deploy == 'true'"
check "deploy-check: checkout du dépôt courant épinglé" in_dc 'actions/checkout@v7\.0\.1'
check "deploy-check: checkout d'infra (josias-koffi/infra) épinglé sur un SHA de 40 caractères" infra_checkout_sha
check "deploy-check: pas de ref flottante (main/master/develop)" dc_lacks 'ref: (main|master|develop|HEAD)'
check "deploy-check: INFRA_DIR pointe sur le checkout d'infra" in_dc 'INFRA_DIR:'
check "deploy-check: installe jsonschema" in_dc 'pip install.*jsonschema'
check "deploy-check: lance deploy-check / pnpm deploy:check" in_dc 'deploy-check\.sh|pnpm deploy:check'
check "deploy-check: ordre checkout d'infra < validation" dc_before 'josias-koffi/infra' 'deploy-check\.sh|pnpm deploy:check'
check "deploy-check: ordre pip install < validation" dc_before 'pip install' 'deploy-check\.sh|pnpm deploy:check'
check "deploy-check: aucun secret (dépôt infra public)" dc_lacks 'secrets\.'
check "deploy-check: actions épinglées" dc_actions_pinned
check "job ci agrège deploy-check (needs)" in_ci 'needs:.*deploy-check'
check "job ci : échec si deploy-check est en failure ou cancelled" in_ci "needs\\.deploy-check\\.result == 'failure' \\|\\| needs\\.deploy-check\\.result == 'cancelled'"
check "job ci : deploy-check skipped reste accepté (pas de garde != 'success')" ci_accepts_deploy_skipped

# TK-142 : job a11y-web (axe sur les écrans de apps/web, faux API, sans base ni secret)
a11y_block() { job_block a11y-web; }
in_a11y() { a11y_block | grep -Eq -- "$1"; }
a11y_present() { [ -n "$(a11y_block)" ]; }
a11y_lacks() { a11y_present && ! a11y_block | grep -Eq -- "$1"; }
a11y_pinned() { a11y_present && ! a11y_block | grep -E 'uses:' | grep -vE '@v[0-9]+\.[0-9]+\.[0-9]+' | grep -q .; }
a11y_rank() { a11y_block | grep -nE -- "$1" | head -1 | cut -d: -f1; }
a11y_before() {
    local a b
    a="$(a11y_rank "$1")"
    b="$(a11y_rank "$2")"
    [ -n "$a" ] && [ -n "$b" ] && [ "$a" -lt "$b" ]
}
ci_accepts_a11y_skipped() { ! job_block ci | grep -Eq "needs\\.a11y-web\\.result != 'success'"; }
check "a11y-web: job présent" g '^  a11y-web:'
check "a11y-web: dépend de changes" in_a11y 'needs:.*changes'
check "a11y-web: déclenché par outputs.code" in_a11y "needs\.changes\.outputs\.code == 'true'"
check "a11y-web: install --frozen-lockfile" in_a11y 'pnpm install --frozen-lockfile'
check "a11y-web: construit les dépendances du web (turbo build --filter=@koklo/web^...)" in_a11y 'turbo run build --filter=@koklo/web\^\.\.\.'
check "a11y-web: installe Chromium pour @koklo/web" in_a11y '@koklo/web exec playwright install --with-deps chromium'
check "a11y-web: lance a11y.spec.ts et dev-ui.spec.ts" in_a11y 'playwright test e2e/a11y\.spec\.ts e2e/dev-ui\.spec\.ts'
check "a11y-web: ordre build < tests" a11y_before 'turbo run build' 'playwright test'
check "a11y-web: ordre navigateur < tests" a11y_before 'playwright install' 'playwright test'
check "a11y-web: upload du rapport en cas d'échec" in_a11y 'if: (failure|always)\(\)'
check "a11y-web: actions épinglées" a11y_pinned
check "a11y-web: aucun secret (faux API)" a11y_lacks 'secrets\.'
check "job ci agrège a11y-web (needs)" in_ci 'needs:.*a11y-web'
check "job ci : échec si a11y-web est en failure ou cancelled" in_ci "needs\\.a11y-web\\.result == 'failure' \\|\\| needs\\.a11y-web\\.result == 'cancelled'"
check "job ci : a11y-web skipped reste accepté (pas de garde != 'success')" ci_accepts_a11y_skipped
finish
