# Story: CLI Sprint 01 — Workspace Bootstrap + Storage + Events

## Status: Implemented

## Acceptance Criteria
- [ ] `cargo run -p koklo-cli -- --help` shows run/status/resume commands
- [ ] `cargo test -p koklo-storage` — all CRUD tests pass
- [ ] `cargo test -p koklo-events` — send/receive tests pass
- [ ] `cargo check --workspace` passes with no errors

## Tasks Completed
- [x] Added `crates/events` to workspace
- [x] Implemented PipelineEvent enum + EventBus (tokio broadcast)
- [x] Implemented SessionManager with SQLite (sqlx)
- [x] CLI entry point with clap (run, status, resume stubs)
- [x] `.koklo/pipeline.toml` configuration
