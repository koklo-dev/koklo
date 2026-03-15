# Story: CLI Sprint 04 — GitHub PR + Resume + Polish

## Status: Implemented

## Acceptance Criteria
- [x] Review phase creates a GitHub PR via octocrab when `GITHUB_TOKEN` is set
- [x] `koklo resume <session-id>` resumes from the last incomplete phase
- [x] `koklo status` lists sessions; `koklo status <id>` shows phases
- [x] CI already covers new crates via `cargo test --workspace`
- [x] `apps/cli/README.md` documents all commands and env vars

## Tasks Completed
- [x] Added `octocrab = "0.39"` to `workflow-engine`
- [x] `GithubConfig::from_env()` reads GITHUB_TOKEN, owner, repo, base_branch
- [x] `PipelineOrchestrator::create_github_pr()` creates PR after Review phase
- [x] `PipelineOrchestrator::resume()` skips completed phases (HashSet diff)
- [x] Gate on rejection: session status → "paused" (resumable)
- [x] CLI `run` wired to `PipelineOrchestrator::run_feature()`
- [x] CLI `resume` wired to `PipelineOrchestrator::resume()`
- [x] CLI `status` shows tabular session list + per-session phase detail
- [x] `build_orchestrator()`: Anthropic if API key set, else Ollama fallback
- [x] `apps/cli/README.md` created
