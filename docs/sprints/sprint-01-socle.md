# Sprint 01 — Socle Workspace + CLI + Storage + Events

## Objectif
`cargo run -p koklo-cli -- --help` fonctionne, SQLite opérationnel.

## Statut
Implémenté

## Tâches
- [x] `crates/events` — PipelineEvent + EventBus (tokio broadcast)
- [x] `crates/storage` — SessionManager CRUD (sqlx + SQLite)
- [x] `apps/cli` — CLI clap (run, status, resume)
- [x] Workspace deps: clap, ratatui, reqwest, tokio-stream, tracing-subscriber
- [x] `.koklo/pipeline.toml` — config pipeline

## Critère de validation
`cargo run -p koklo-cli -- --help` → affiche les 3 commandes

## Commits
- feat(cli): bootstrap workspace + CLI entry point
