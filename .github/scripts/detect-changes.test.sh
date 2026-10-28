#!/usr/bin/env bash
# Tests de detect-changes.sh (TK-4, critère 3 : une PR ne lance que les jobs nécessaires).
# Contrat : liste de fichiers (un par ligne) sur stdin -> code=, skills=, ci=, deploy= (true|false) sur stdout.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/lib-test.sh"
SUT="$HERE/detect-changes.sh"

out() { printf '%b' "$1" | bash "$SUT" 2>&1; }
has() { out "$1" | grep -qx "$2"; }
four_lines() { [ "$(printf 'README.md\n' | bash "$SUT" | grep -Ec '^(code|skills|ci|deploy)=(true|false)$')" = 4 ]; }

echo "detect-changes.sh"
[ -f "$SUT" ] || { ko "script absent: .github/scripts/detect-changes.sh"; finish; exit $?; }

# T3.1 aucun paquet touché
for f in 'README.md\n' 'docs/x.md\nREADME.md\n' 'design/screens/S-1.md\n' ''; do
    for k in code=false skills=false ci=false deploy=false; do
        check "sans code ($f) -> $k" has "$f" "$k"
    done
done

# T3.2 code
for f in 'apps/web/x.ts\n' 'packages/domain/src/a.ts\n' 'pnpm-lock.yaml\n' 'package.json\n' \
    'turbo.json\n' 'biome.json\n' 'tsconfig.json\n' '.nvmrc\n' 'pnpm-workspace.yaml\n'; do
    check "$f -> code=true" has "$f" code=true
done

# TK-15 : le paquet e2e/ déclenche les jobs de code
for f in 'e2e/package.json\n' 'e2e/tests/projects.spec.ts\n'; do
    check "$f -> code=true" has "$f" code=true
done

# T3.3 skills
for f in 'shipyard/skills/x.md\n' '.claude/skills/x/SKILL.md\n' '.codex/skills/x/SKILL.md\n'; do
    check "$f -> skills=true" has "$f" skills=true
    check "$f -> code=false" has "$f" code=false
done

# T3.4 ci
for f in '.github/scripts/x.sh\n' '.github/workflows/ci.yml\n' '.github/fixtures/coverage/ok/a.json\n'; do
    check "$f -> ci=true" has "$f" ci=true
done
check "ci.yml -> code=true" has '.github/workflows/ci.yml\n' code=true
check ".github/scripts seul -> skills=false" has '.github/scripts/x.sh\n' skills=false

check "mélange docs+code -> code=true" has 'README.md\napps/api/a.ts\n' code=true
check "exactement 4 sorties key=value" four_lines
# TK-16 : Dockerfiles et .dockerignore déclenchent les jobs de code (build des images)
for f in 'apps/web/Dockerfile\n' 'apps/api/Dockerfile\n' 'apps/worker/Dockerfile\n' '.dockerignore\n'; do
    check "$f -> code=true" has "$f" code=true
done
# TK-17 : sortie deploy (le job deploy-check ne tourne que si .deploy/ change)
for f in '.deploy/manifest.yaml\n' '.deploy/x\n' 'README.md\n.deploy/manifest.yaml\n'; do
    check "$f -> deploy=true" has "$f" deploy=true
done
for f in 'apps/x\n' 'apps/web/x.ts\n' 'packages/domain/src/a.ts\n' '.github/workflows/ci.yml\n' 'shipyard/skills/x.md\n' 'README.md\n' 'deploy/x\n' 'apps/web/.deploy/x\n' ''; do
    check "$f -> deploy=false" has "$f" deploy=false
done
check ".deploy/x seul -> skills=false" has '.deploy/x\n' skills=false
finish
