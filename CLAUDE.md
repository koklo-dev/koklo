# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

### Rust (Cargo workspace)

```bash
cargo check --workspace          # Fast compile check
cargo test --workspace           # Run all tests
cargo test -p koklo-providers    # Test a single crate
cargo test test_name             # Run a single test by name
cargo clippy --all-targets --all-features -- -D warnings  # Lint (CI-strict)
cargo fmt --all -- --check       # Format check
cargo fmt --all                  # Auto-format
cargo run -p koklo-cli -- <cmd>  # Run CLI without installing
```

### TypeScript (pnpm workspace)

```bash
pnpm install --frozen-lockfile
pnpm run build       # Build all packages
pnpm run lint        # Lint all packages
pnpm run typecheck   # Typecheck all packages
```

### Pre-PR checklist

Run the open-core boundary check before opening a PR — CI will fail without it:

```bash
bash scripts/check-boundary.sh
```

This ensures public AGPL code never references `koklo-ee` / `koklo_ee` / `"ee"`.

## Architecture

Koklo is a monorepo combining a Rust backend and TypeScript/React frontend for AI-assisted software development workflows.

### Workspace layout

- **`apps/cli`** — CLI binary (`koklo` command). TUI built with ratatui/crossterm.
- **`apps/desktop/src-tauri`** — Tauri 2 desktop shell wrapping the frontend.
- **`crates/`** — Rust library crates (the backend).
- **`packages/`** — TypeScript packages (UI components, tRPC client, constellation visualization).

### Crate dependency graph (key relationships)

```
workflow-engine  ─→  agent-runtime  ─→  providers
       │                   │
       ├→ storage          ├→ events
       ├→ providers        └→ shell
       └→ shell
```

- **`core`** — Shared types, models, and trait definitions (deploy, SSO, collab, audit). Most crates depend on this.
- **`providers`** — LLM provider gateway. Supports Claude Code and Codex (CLI subprocess), OpenRouter (HTTP), and Ollama (local). Defines `LlmProvider` trait with streaming, approval, and user-input contracts via `ProviderSessionEvent`.
- **`agent-runtime`** — Loads system prompts, dispatches LLM calls, manages streaming and tool-call approval flows.
- **`workflow-engine`** — DAG-based pipeline orchestration. Sequences phases (e.g., PM → Architect → Developer → QA → Reviewer).
- **`storage`** — SQLite persistence for sessions and artifacts.
- **`events`** — Async event bus for pipeline events, transcript streaming, and human approval gates.
- **`shell`** — Sandboxed shell command execution with optional PTY support.
- **`git-engine`**, **`doc-generator`**, **`ticket-system`** — Stub crates, not yet implemented.

### CLI workflow presets

The CLI runs multi-agent pipelines with built-in presets: SDD (5 phases), BMAD (8 phases), Spec Kit (6 phases), Light (3 phases). Each phase maps to a built-in agent role (pm, architect, developer, qa, reviewer, etc.).

### Provider selection

Provider per agent is configured via `KOKLO_PROVIDER_<AGENT>` env vars or `.koklo/pipeline.toml`. The `providers` crate resolves a fallback chain and handles three interaction modes: Native, Normalized, and Synthetic.

## Licensing

AGPLv3 for public code. Premium features live in `ee/` under a commercial license. The boundary check script enforces this separation — public crates/apps/packages must never import or reference `koklo-ee`.
