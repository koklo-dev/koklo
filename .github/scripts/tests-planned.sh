#!/usr/bin/env bash
# Lit sur stdin la sortie de `turbo run test [--affected] --dry=json` et écrit
# `planned=true` si au moins une tâche `test` va réellement s'exécuter, `planned=false` sinon,
# puis `packages=<dir>,<dir>` : les répertoires des paquets dont la tâche `test` est planifiée.
# Sert à n'exiger des rapports de couverture que lorsque des tests tournent (une PR qui ne
# touche que des fichiers racine — scripts, biome.json, workflows… — n'en produit aucun), et
# à exiger un rapport pour chaque paquet testé.
set -uo pipefail
command -v jq >/dev/null || { echo "tests-planned: jq is required" >&2; exit 2; }

out="$(jq -r '[(.tasks // [])[] | select(.task == "test" and .command != "<NONEXISTENT>")] as $t
    | "planned=\(($t | length) > 0)", "packages=\([$t[].directory // empty] | unique | join(","))"')" || exit 2
echo "$out"
