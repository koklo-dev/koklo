#!/usr/bin/env bash
# Repository-wide test coverage for Koklo.
# Rust coverage is measured and gated with cargo-llvm-cov against the spec
# threshold (engineering-standards.md §2: 80% line minimum). TypeScript
# coverage is not yet wired — the frontend packages are stubs without tests
# (tracked as a backlog follow-up, see Tooling & Gates).
#
# Usage:
#   bash scripts/coverage.sh                 # enforce the 80% line threshold
#   KOKLO_COVERAGE_LINE_MIN=0 bash scripts/coverage.sh   # report-only
# Prerequisites:
#   - cargo-llvm-cov  (install: cargo install cargo-llvm-cov --locked)

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

LINE_MIN="${KOKLO_COVERAGE_LINE_MIN:-80}"

echo "==> Rust coverage (cargo-llvm-cov, fail-under-lines=${LINE_MIN})"
if ! command -v cargo-llvm-cov >/dev/null 2>&1; then
  echo "ERROR: cargo-llvm-cov not found. Install with: cargo install cargo-llvm-cov --locked" >&2
  exit 127
fi
cargo llvm-cov --workspace --fail-under-lines "$LINE_MIN"
rust_exit=$?

echo "==> TypeScript coverage"
echo "SKIPPED: frontend packages have no test suites yet (echo stubs)."
echo "Tracked as a backlog follow-up; wire with the P2 frontend (US-016)."

exit "$rust_exit"
