#!/usr/bin/env bash
# Lit une liste de fichiers modifiés (un par ligne, stdin) et décide quels jobs
# de la CI sont nécessaires. Sortie : code=, skills=, ci= (true|false).
#   code   : un paquet, une config racine partagée ou la CI elle-même a changé
#   skills : une compétence de projet (source ou copie publiée) a changé
#   ci     : les scripts, fixtures ou workflows de la CI ont changé
set -uo pipefail

code=false
skills=false
ci=false

while IFS= read -r f; do
    case "$f" in
    apps/* | packages/* | e2e/* | scripts/* | .deploy/* | \
        package.json | pnpm-lock.yaml | pnpm-workspace.yaml | turbo.json | biome.json | \
        tsconfig.json | tsconfig.*.json | .nvmrc | docker-compose.yml | .dockerignore)
        code=true ;;
    shipyard/skills/* | .claude/skills/* | .codex/skills/*)
        skills=true ;;
    .github/workflows/*)
        ci=true
        code=true ;;
    .github/*)
        ci=true ;;
    esac
done

echo "code=$code"
echo "skills=$skills"
echo "ci=$ci"
