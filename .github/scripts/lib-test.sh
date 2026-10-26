#!/usr/bin/env bash
# Mini-harnais partagé par les *.test.sh : compteur de cas, résumé, code retour.
PASS=0
FAIL=0
ok() { PASS=$((PASS + 1)); echo "  ✓ $1"; }
ko() { FAIL=$((FAIL + 1)); echo "  ✗ $1"; }
check() { # check "nom" commande...
    local name="$1"
    shift
    if "$@" >/dev/null 2>&1; then ok "$name"; else ko "$name"; fi
}
finish() {
    echo "$PASS passed, $FAIL failed"
    [ "$FAIL" -eq 0 ]
}
