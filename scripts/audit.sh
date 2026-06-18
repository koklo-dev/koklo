#!/usr/bin/env bash
# Repository-wide dependency audit for Koklo.
# Runs the Rust (cargo-audit) and pnpm audits from one entry point and
# blocks the gate on high/critical vulnerabilities.
#
# Usage: bash scripts/audit.sh
# Prerequisites:
#   - cargo-audit  (install: cargo install cargo-audit --locked)
#   - pnpm >= 9

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail=0

echo "==> Rust dependency audit (cargo-audit)"
if ! command -v cargo-audit >/dev/null 2>&1; then
  echo "ERROR: cargo-audit not found. Install with: cargo install cargo-audit --locked" >&2
  exit 127
fi
# cargo-audit exits non-zero on any RUSTSEC *vulnerability* advisory; informational
# warnings (unmaintained/yanked) stay non-blocking unless --deny warnings is added.
cargo audit || fail=1

echo "==> pnpm dependency audit (high/critical block)"
if ! command -v pnpm >/dev/null 2>&1; then
  echo "ERROR: pnpm not found. Install pnpm >= 9." >&2
  exit 127
fi
# --audit-level high makes only high and critical advisories produce a non-zero exit.
pnpm audit --audit-level high || fail=1

if [ "$fail" -ne 0 ]; then
  echo "FAIL: dependency audit found high/critical vulnerabilities." >&2
  exit 1
fi

echo "PASS: no high/critical vulnerabilities found."
