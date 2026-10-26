#!/usr/bin/env bash
# Lit sur stdin la sortie de `turbo run test [--affected] --dry=json` et écrit
# `planned=true` si au moins une tâche `test` va réellement s'exécuter, `planned=false` sinon.
# Sert à n'exiger des rapports de couverture que lorsque des tests tournent : une PR qui ne
# touche que des fichiers racine (scripts, biome.json, workflows…) n'en produit aucun.
set -uo pipefail
command -v jq >/dev/null || { echo "tests-planned: jq is required" >&2; exit 2; }

n="$(jq -r '[(.tasks // [])[] | select(.task == "test" and .command != "<NONEXISTENT>")] | length')" || exit 2
if [ "$n" -gt 0 ]; then echo "planned=true"; else echo "planned=false"; fi
