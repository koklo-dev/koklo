#!/usr/bin/env bash
# Régénère .github/fixtures/coverage/* (rapports au format Vitest json-summary).
# Usage : bash .github/scripts/gen-coverage-fixtures.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../fixtures/coverage"

metric() { # covered total
    jq -n --argjson c "$1" --argjson t "$2" '{total: $t, covered: $c, skipped: 0, pct: (100 * $c / $t)}'
}
report() { # fixture paquet lignes_cov lignes_tot br_cov br_tot
    local dir="$1/$2/coverage"
    mkdir -p "$dir"
    jq -n --argjson l "$(metric "$3" "$4")" --argjson b "$(metric "$5" "$6")" \
        '{total: {lines: $l, statements: $l, functions: $l, branches: $b}}' >"$dir/coverage-summary.json"
}

report ok packages/domain 95 100 95 100
report ok packages/delivery 92 100 92 100
report ok apps/web 80 100 70 100

report below packages/domain 95 100 95 100
report below apps/web 50 100 25 100

report below-domain packages/domain 95 100 80 100
report below-domain packages/contract 100 100 100 100

report below-delivery packages/delivery 95 100 85 100
report below-delivery packages/contract 100 100 100 100

mkdir -p empty
touch empty/.gitkeep
