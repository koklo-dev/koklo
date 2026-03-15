# Sprint 04 — GitHub PR + Resume + CI

## Objectif
Pipeline complet spec → PR.

## Statut
Implémenté

## Tâches
- [x] Phase Review → octocrab 0.39 crée PR (optionnel si GITHUB_TOKEN absent)
- [x] `GithubConfig::from_env()` — GITHUB_TOKEN, KOKLO_GITHUB_OWNER, KOKLO_GITHUB_REPO, KOKLO_BASE_BRANCH
- [x] `koklo resume` → `PipelineOrchestrator::resume()` (skip phases déjà complètes)
- [x] Gate rejection → status "paused" (session reprable via resume)
- [x] `koklo status` → liste tabulaire + détail phases par session
- [x] `build_orchestrator()` → Anthropic ou Ollama selon env
- [x] CI : `cargo test --workspace` couvre automatiquement les nouvelles crates
- [x] `apps/cli/README.md` — install, commands, env vars, controlled shell

## Critère de validation
`koklo run feature "Auth JWT"` → crée une PR sur koklo-dev/koklo (si GITHUB_TOKEN défini)

## Commits
- feat(workflow-engine): GitHub PR creation via octocrab
- feat(cli): wire run/resume to PipelineOrchestrator + status table
