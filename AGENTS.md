# Repository Guidelines

## Project Structure & Module Organization

Koklo is a monorepo split between Rust applications/crates and TypeScript packages. Use `apps/cli` for the Rust CLI, `apps/desktop` for the Tauri desktop app, and `crates/` for core backend modules such as `workflow-engine`, `storage`, `providers`, and `shell`. Frontend/shared TS code lives in `packages/` (`ui`, `constellation`, `trpc-client`). Cross-repo end-to-end tests live in `tests/`, automation scripts in `scripts/`, and CI definitions in `.github/workflows/`.

## Build, Test, and Development Commands

- `cargo fmt --all -- --check`: verify Rust formatting.
- `cargo clippy --all-targets --all-features -- -D warnings`: run the Rust lint gate enforced in CI.
- `cargo test --workspace`: run the full Rust test suite.
- `pnpm install`: install frontend/workspace dependencies.
- `pnpm run lint`: run all package lint scripts.
- `pnpm run typecheck`: run TypeScript type checks across packages.
- `pnpm run build`: build all frontend packages.
- `bash scripts/check-boundary.sh`: verify the open-core boundary check used by CI.

## Coding Style & Naming Conventions

Rust code should be `rustfmt`-clean and Clippy-clean with warnings treated as errors. Prefer small structs over long argument lists and keep module boundaries explicit. Use `snake_case` for Rust functions/modules, `PascalCase` for types, and conventional crate names such as `koklo-storage`. In TypeScript packages, follow the existing package-local linting rules and keep file and component names aligned with the package style.

## Testing Guidelines

Keep unit tests close to the code they validate, typically in `src/lib.rs` or the same module under `#[cfg(test)]`. Name tests descriptively, for example `test_record_and_get_agent_logs`. Before opening a PR, run `cargo clippy`, `cargo test --workspace`, `pnpm run lint`, `pnpm run typecheck`, and `pnpm run build`.

## Commit & Pull Request Guidelines

Follow the repository’s Conventional Commit style: `fix(storage): ...`, `feat(cli): ...`, `style(shell): ...`, `refactor: ...`. Keep each commit scoped to one concern. PRs should include a short problem statement, a summary of the change, linked issues or PR references when relevant, and screenshots or terminal output for UI/CLI changes.

## Security & Configuration Tips

Do not commit secrets. Prefer environment variables such as `GITHUB_TOKEN` for integrations. When changing licensing or module boundaries, re-run `bash scripts/check-boundary.sh` and review `SECURITY.md` before merging.
