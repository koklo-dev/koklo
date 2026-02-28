#!/usr/bin/env bash
# Boundary check for Koklo open core.

set -e

echo "Boundary check: scanning for references to koklo-ee..."

VIOLATIONS=$(grep -r "koklo-ee\|koklo_ee\|\"ee\"" \
  --include="*.rs" \
  --include="*.toml" \
  crates/ apps/ packages/ \
  --exclude-dir=".git" \
  -l 2>/dev/null || true)

if [ -n "$VIOLATIONS" ]; then
  echo "Open core boundary violation detected:"
  echo "$VIOLATIONS"
  echo "Public AGPL code must not reference koklo-ee."
  exit 1
else
  echo "Boundary check passed: no koklo-ee references found."
fi
