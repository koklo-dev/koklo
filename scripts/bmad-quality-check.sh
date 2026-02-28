#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "[1/4] boundary check"
bash scripts/check-boundary.sh

echo "[2/4] cargo fmt check"
cargo fmt --all -- --check

echo "[3/4] cargo clippy"
cargo clippy --workspace --all-targets -- -D warnings

echo "[4/4] cargo test"
cargo test --workspace

echo "BMAD quality checks passed"
