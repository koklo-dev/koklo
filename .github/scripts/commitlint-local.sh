#!/usr/bin/env bash
# Rejoue en local le gate CI `commitlint` (.github/workflows/commitlint.yml) :
# mêmes version et config. À lancer avant tout push et avant tout `gh pr create`.
#   commitlint-local.sh                  commits de <base>..HEAD (base = origin/develop)
#   commitlint-local.sh --title "<titre>" titre de PR seul
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

version=$(sed -n 's/^  COMMITLINT_VERSION: *//p' .github/workflows/commitlint.yml)
[ -n "$version" ] || { echo "COMMITLINT_VERSION introuvable dans commitlint.yml" >&2; exit 2; }

prefix="${TMPDIR:-/tmp}/commitlint-$version"
if [ ! -x "$prefix/node_modules/.bin/commitlint" ]; then
  npm install --no-save --no-package-lock --prefix "$prefix" \
    "@commitlint/cli@$version" "@commitlint/config-conventional@$version" >/dev/null
fi
export COMMITLINT_PRESET="$prefix/node_modules/@commitlint/config-conventional/lib/index.js"
lint="$prefix/node_modules/.bin/commitlint"

if [ "${1:-}" = "--title" ]; then
  printf '%s\n' "${2:?titre manquant}" | "$lint" --config .github/commitlint.config.mjs
else
  "$lint" --config .github/commitlint.config.mjs --from "${COMMITLINT_BASE:-origin/develop}" --to HEAD
fi
