# Pipeline Spec v2 — Koklo Autonomous Development Pipeline

## Overview

`koklo run feature "<title>"` orchestrates a 5-phase AI pipeline:

```
PM → Architect → Developer → QA → Reviewer
```

Each phase runs in an isolated sandbox with a human gate before proceeding.

## Crate Mapping

| Role | Crate | Purpose |
|---|---|---|
| Pipeline orchestration | `crates/workflow-engine` | `PipelineOrchestrator` + phases |
| Sandbox isolation | `crates/shell` | `LandlockSandbox`, `BubblewrapSandbox`, `ControlledShell` |
| LLM dispatch | `crates/providers` | `AnthropicProvider`, `OllamaProvider` |
| Session persistence | `crates/storage` | `SessionManager` (SQLite) |
| Event streaming | `crates/events` | `EventBus` (tokio broadcast) |
| Agent execution | `crates/agent-runtime` | `AgentRunner` |
| CLI entry | `apps/cli` | `koklo run/status/resume` |

## Commands

```bash
koklo run feature "Auth JWT"   # Start pipeline
koklo status                    # List all sessions
koklo status <session-id>       # Inspect specific session
koklo resume <session-id>       # Resume from last phase
```

## Configuration

`.koklo/pipeline.toml` — provider selection, agent prompts, sandbox type per phase.

## Gates

After each phase, the human is prompted:
```
[GATE] Phase 'spec' complete. Approve? [y/N]
```
- `y` → continue
- anything else → pipeline stops (session saved as "paused")
