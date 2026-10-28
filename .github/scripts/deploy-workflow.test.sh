#!/usr/bin/env bash
# Tests structurels de .github/workflows/deploy.yml et de la cohérence API non exposée (TK-18).
# Critères « avant merge » : 3 build-push, image-check entre build et deploy, promotion par image_tag,
# aucun CHANGE-ME, actions épinglées, aucun secret de plateforme ; BETTER_AUTH_URL = origine web ;
# plus aucune référence à API_URL (remplacée par API_INTERNAL_URL) ni à une « URL de l'API » pour Better Auth.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
. "$HERE/lib-test.sh"
WF="$ROOT/.github/workflows/deploy.yml"

echo "deploy.yml (TK-18)"
[ -f "$WF" ] || { ko "absent: .github/workflows/deploy.yml"; WF=/dev/null; }

g() { grep -Eq -- "$1" "$WF"; }
in_job() { job_block "$1" | grep -Eq -- "$2"; }
# Actions tierces épinglées à une version complète ; les workflows réutilisables d'infra (@main) et locaux sont exclus.
unpinned() { grep -E '^\s*-? *uses:' "$WF" | grep -vE 'josias-koffi/infra/' | grep -vE '@v[0-9]+\.[0-9]+\.[0-9]+'; }
no_unpinned() { [ -s "$WF" ] && ! unpinned | grep -q .; }
count_build_push() { job_block build | grep -cE 'uses: docker/build-push-action@'; }
needs_of() { job_block "$1" | grep -E '^    needs:'; }

check "workflow nommé Deploy" g '^name: Deploy$'
check "déclenché sur push" g '^  push:'
check "workflow_dispatch présent" g '^  workflow_dispatch:'
check "input image_tag (promotion de production)" bash -c "awk '/^  workflow_dispatch:/{on=1} on' '$WF' | grep -Eq '^      image_tag:'"
check "image_tag transmis à resolve" bash -c "awk '/^  resolve:/{on=1;next} on && /^  [a-z-]+:/{on=0} on' '$WF' | grep -Eq 'image_tag: *\\$\\{\\{ *inputs\\.image_tag'"
check "plus aucun CHANGE-ME" bash -c "[ -s '$WF' ] && ! grep -q 'CHANGE-ME' '$WF'"
check "aucune action non épinglée" no_unpinned
check "3 étapes build-push (web, api, worker)" bash -c "[ \"\$($(declare -f job_block count_build_push); WF='$WF'; count_build_push)\" = 3 ]"
for app in web api worker; do
    check "build-push de ghcr.io/…/koklo-$app" in_job build "koklo-$app:"
done
check "build conditionné par resolve.outputs.build" in_job build "needs\\.resolve\\.outputs\\.build == 'true'"
check "job image-check présent" g '^  image-check:'
check "image-check dépend de build" bash -c "$(declare -f job_block needs_of); WF='$WF'; needs_of image-check | grep -Eq 'build'"
check "image-check tolérant à un build ignoré (if: !failure() && !cancelled())" in_job image-check "^    if: .*!failure\\(\\) *&& *!cancelled\\(\\)"
check "image-check ne tourne que si un déploiement est demandé" in_job image-check "needs\\.resolve\\.outputs\\.deploy == 'true'"
check "image-check lance un Postgres jetable" in_job image-check 'postgres'
check "image-check tire l'image api au tag de resolve" in_job image-check "koklo-api:.*needs\\.resolve\\.outputs\\.image_tag|image_tag.*koklo-api"
check "image-check vérifie GET /health" in_job image-check '/health'
image_check_no_secret() { [ -n "$(job_block image-check)" ] && ! job_block image-check | grep -Eq 'secrets\.(INFRA|[A-Z_]+_(TOKEN|SECRET|KEY))'; }
check "image-check n'utilise aucun secret de plateforme" image_check_no_secret
check "deploy dépend de image-check" bash -c "$(declare -f job_block needs_of); WF='$WF'; needs_of deploy | grep -Eq 'image-check'"
check "deploy dépend de build et resolve" bash -c "$(declare -f job_block needs_of); WF='$WF'; needs_of deploy | grep -Eq 'resolve' && needs_of deploy | grep -Eq 'build'"
check "deploy if: !failure() && !cancelled()" in_job deploy "^    if: .*!failure\\(\\) *&& *!cancelled\\(\\)"
check "deploy utilise dispatch-deploy d'infra" in_job deploy 'josias-koffi/infra/\.github/workflows/dispatch-deploy\.yml@'
check "seul INFRA_DEPLOY_TOKEN est transmis" bash -c "[ -s '$WF' ] && grep -oE 'secrets\\.[A-Z_]+' '$WF' | sort -u | grep -vE '^secrets\\.(GITHUB_TOKEN|INFRA_DEPLOY_TOKEN)$' | wc -l | grep -qx 0"
check "aucun identifiant de plateforme (CLOUDFLARE, SSH, VPS, R2)" bash -c "[ -s '$WF' ] && ! grep -Eiq 'cloudflare|ssh_|vps|r2_|aws_' '$WF'"
check "aucun NEXT_PUBLIC_* dans le workflow" bash -c "[ -s '$WF' ] && ! grep -q 'NEXT_PUBLIC_' '$WF'"
check "permissions packages: write (push GHCR)" g '^  packages: write'

echo "API non exposée : API_INTERNAL_URL et BETTER_AUTH_URL = origine web (TK-18)"
no_api_url() { # no_api_url <fichier...> : aucune occurrence de API_URL (hors API_INTERNAL_URL, NEXT_PUBLIC_API_URL)
    [ -f "$1" ] && ! grep -E '(^|[^A-Z_])API_URL' "$@" | grep -q .
}
renamed_api_url() { grep -q 'API_INTERNAL_URL' "$1" && no_api_url "$1"; } # cite le nouveau nom, jamais l'ancien
check "web: runtime-config lit API_INTERNAL_URL" grep -q 'API_INTERNAL_URL' "$ROOT/apps/web/src/lib/runtime-config.ts"
check "web: runtime-config ne lit plus API_URL" no_api_url "$ROOT/apps/web/src/lib/runtime-config.ts"
check "web: proxy.ts ne cite plus API_URL" no_api_url "$ROOT/apps/web/src/proxy.ts"
check "web: Dockerfile ne cite plus API_URL" no_api_url "$ROOT/apps/web/Dockerfile"
check "web: playwright.config utilise API_INTERNAL_URL" bash -c "grep -q 'API_INTERNAL_URL' '$ROOT/apps/web/playwright.config.ts'"
check "web: playwright.config sans API_URL" no_api_url "$ROOT/apps/web/playwright.config.ts"
check "e2e/scripts/run.ts: API_INTERNAL_URL passée au web" grep -q 'API_INTERNAL_URL' "$ROOT/e2e/scripts/run.ts"
check "e2e/scripts/run.ts: plus d'API_URL transmise au web" bash -c "! grep -E '^\s*API_URL[,:]' '$ROOT/e2e/scripts/run.ts'"
check "e2e/scripts/run.ts: BETTER_AUTH_URL = origine du web" bash -c "grep -Eq 'BETTER_AUTH_URL: *WEB_URL' '$ROOT/e2e/scripts/run.ts'"
check "e2e/scripts/dev.ts: API_INTERNAL_URL, plus API_URL" renamed_api_url "$ROOT/e2e/scripts/dev.ts"
check "docker-images.test.sh: web démarré avec API_INTERNAL_URL" renamed_api_url "$ROOT/.github/scripts/docker-images.test.sh"
check "ADR 0006 mise à jour: API_INTERNAL_URL" grep -q 'API_INTERNAL_URL' "$ROOT/docs/adr/0006-web-same-origin-proxy-runtime-config.md"
check "ADR 0006 sans API_URL (ancien nom)" no_api_url "$ROOT/docs/adr/0006-web-same-origin-proxy-runtime-config.md"

WEBRE="web (origin|public)|public (URL|origin) of the web|web.s public"
export WEBRE
echo "Docs et .env.example : BETTER_AUTH_URL = URL publique du web"
ENVEX="$ROOT/apps/api/.env.example"
better_line() { grep -B2 '^BETTER_AUTH_URL=' "$ENVEX"; }
env_is_web() { better_line | grep -Eiq "(URL|origine) publique du web"; }
check ".env.example: BETTER_AUTH_URL décrite comme URL publique du web" env_is_web
env_not_api() { [ -n "$(better_line)" ] && ! better_line | grep -Eiq "URL publique de l'API"; }
check ".env.example: plus « URL publique de l'API »" env_not_api
for d in architecture onboarding quality-and-operations; do
    check "docs/$d.md: aucune BETTER_AUTH_URL « de l'API »" bash -c "! grep -Ein 'BETTER_AUTH_URL' '$ROOT/docs/$d.md' | grep -Eiq \"(of|de) (the )?API|API(.s)? (public )?URL\""
done
check "docs: BETTER_AUTH_URL = URL publique du web (onboarding)" bash -c "grep -Ei 'BETTER_AUTH_URL' '$ROOT/docs/onboarding.md' | grep -Eiq \"\$WEBRE\""
check "docs: BETTER_AUTH_URL = URL publique du web (quality-and-operations)" bash -c "grep -Ei -B2 -A2 'BETTER_AUTH_URL' '$ROOT/docs/quality-and-operations.md' | grep -Eiq \"\$WEBRE\""
check "docs: onboarding cite API_INTERNAL_URL (plus API_URL)" renamed_api_url "$ROOT/docs/onboarding.md"
check "docs: callback GitHub sur l'origine web" bash -c "grep -Eiq 'callback' '$ROOT/docs/quality-and-operations.md' && grep -Ei 'callback' '$ROOT/docs/quality-and-operations.md' | grep -Eiq 'web'"
check "docs: smoke test sans domaine api documenté (image-check)" bash -c "grep -rqi 'image-check' '$ROOT/docs/quality-and-operations.md'"

finish
