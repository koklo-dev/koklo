#!/usr/bin/env bash
# Lit sur stdin la sortie de `turbo run test [--affected] --dry=json` et écrit
# `planned=true` si au moins une tâche `test` va réellement s'exécuter, `planned=false` sinon,
# puis `packages=<dir>,<dir>` : les répertoires des paquets dont la tâche `test` est planifiée,
# puis `filters=--filter=<nom> …` : les mêmes paquets, sous la forme d'arguments turbo.
# Sert à n'exiger des rapports de couverture que lorsque des tests tournent (une PR qui ne
# touche que des fichiers racine — scripts, biome.json, workflows… — n'en produit aucun), et
# à exiger un rapport pour chaque paquet testé.
#
# Usage : tests-planned.sh [--only <nom>,<nom>] [--except <nom>,<nom>]
# Découpage de la CI en jobs parallèles : `--only` garde les paquets nommés, `--except` garde
# tous les autres (un nouveau paquet tombe ainsi toujours dans un lot, jamais dans aucun).
# On filtre ici plutôt que par `--filter` turbo combiné à `--affected` : leur combinaison est
# fragile (plusieurs --filter + --affected ne rendent parfois rien).
set -uo pipefail
command -v jq >/dev/null || { echo "tests-planned: jq is required" >&2; exit 2; }

only=""
except=""
while [ $# -gt 0 ]; do
    case "$1" in
    --only)
        shift
        only="${1:-}"
        ;;
    --except)
        shift
        except="${1:-}"
        ;;
    *)
        echo "tests-planned: unknown argument: $1" >&2
        exit 2
        ;;
    esac
    shift
done

out="$(jq -r --arg only "$only" --arg except "$except" '
    ($only | split(",") | map(select(. != ""))) as $o
    | ($except | split(",") | map(select(. != ""))) as $x
    | [(.tasks // [])[]
        | select(.task == "test" and .command != "<NONEXISTENT>")
        | select(($o | length) == 0 or (.package as $p | $o | index($p)))
        | select(.package as $p | ($x | index($p)) | not)] as $t
    | "planned=\(($t | length) > 0)",
      "packages=\([$t[].directory // empty] | unique | join(","))",
      "filters=\([$t[].package // empty] | unique | map("--filter=" + .) | join(" "))"')" || exit 2
echo "$out"
