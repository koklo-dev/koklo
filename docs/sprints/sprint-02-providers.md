# Sprint 02 — LLM Providers + Sandbox

## Objectif
Appels LLM fonctionnels, isolation sandbox active.

## Statut
Implémenté

## Tâches
- [x] `crates/providers` — LlmProvider trait + Anthropic + Ollama
- [x] `crates/shell` — LandlockSandbox + BubblewrapSandbox + ControlledShell

## Critère de validation
`cargo test -p koklo-providers` et `cargo test -p koklo-shell` passent
