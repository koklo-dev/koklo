# Koklo — Maturity Assessment (2026-05-05)

---

## 1. WHAT EXISTS AND WORKS

The core Rust backend and CLI are genuinely functional. No `todo!()` / `unimplemented!()` macros anywhere. 281 tests pass.

### CLI (`koklo` binary) — fully wired to real backend

| Command | Status | Notes |
|---|---|---|
| `koklo init` | Working | Creates `.koklo/pipeline.toml` in a project directory |
| `koklo run [--preset P] <type> <title>` | Working | Executes full multi-phase LLM pipeline with live TUI dashboard |
| `koklo session list/show/resume` | Working | Reads from SQLite; resume re-enters the workflow engine |
| `koklo agent list/show/run/sync` | Working | Loads Markdown agents, runs a single agent in isolation |
| `koklo workflow list/show` | Working | Displays preset definitions |
| `koklo preset` | Working | CRUD for custom presets |
| `koklo config show/init` | Working | Reads/writes `pipeline.toml` |
| `koklo artifacts` | Working | Browses phase outputs from storage |
| `koklo provider list/test/usage` | Working | Queries provider registry, fires a live LLM call for testing |
| `koklo tickets list/create/update/close` | Working | Full CRUD against local SQLite |
| `koklo docs readme/changelog/adr` | Working | Generates template files, parses conventional commits from git log |
| `koklo context` | Working | Manages project context files |
| `koklo ide detect/open` | Working | Detects installed editors, opens files |

### Workflow Engine

- 7 built-in presets: SDD, BMAD, SpecKit, Light, Bugfix, Release, Strict (3–8 phases each)
- Gate/approval checkpoints (human-in-the-loop, works in TUI and `--no-tui` modes)
- Suspend + resume (phases already completed are skipped on restart)
- Git workspace isolation: creates a branch per session, writes artifacts there
- Memory log: appends session summary to `.koklo/memories/YYYY-MM-DD.md`
- Optional GitHub PR creation via `octocrab` (requires `GITHUB_TOKEN`)

### Providers (LLM gateway)

- Ollama (local, streaming, tool-call simulation)
- OpenRouter (multi-model HTTP, per-request model selection, pricing)
- Claude Code CLI subprocess
- Codex CLI subprocess
- OpenAI-compatible endpoint fallback
- FallbackProvider chain (failover on error)
- Per-agent provider routing: env var → TOML → default

### Agent Runtime

- Loads system prompts from Markdown fragments (IDENTITY, SOUL, GUARDRAILS, AGENTS)
- 10 built-in agent roles: pm, architect, developer, qa, reviewer, analyst, security, doc-writer, constitution-writer, task-planner
- Synthetic user-input mode for providers with no native interaction support

### Supporting Crates (all functional)

- **Storage** — SQLite sessions, phases, artifacts, transcript lines, token usage, gate decisions; auto-migrates schema on first run
- **Shell sandboxing** — Linux Landlock (read-only), Bubblewrap (write to workspace), ControlledShell (approval per command)
- **Git engine** — branch, commit, diff, status, stage via libgit2
- **Ticket system** — local SQLite, statuses, priorities, CRUD
- **Doc generator** — README skeleton, CHANGELOG from git log, ADR template
- **Monitor TUI** — ratatui dashboard wired to event bus (transcript, phase timeline, token/cost counters, gate prompts)

---

## 2. WHAT IS SCAFFOLDED BUT NOT FUNCTIONAL

### Structure only (compiles, no logic)

- `crates/core` — 98 lines declaring `models` and `traits` modules with no substance; all real types live in downstream crates; this is an orphaned abstraction
- `apps/desktop/src-tauri` — Tauri 2 app shell (~165 lines), mounts the window and nothing else
- `apps/desktop/src` — React `App.tsx` / `main.tsx` stubs, no actual UI

### Registered in the CLI but returns immediately

- `koklo deploy` — `[coming soon] Phase 10`, prints stub message and exits
- `koklo sync` — `[coming soon] Phase 12`
- `koklo constellation` — `[coming soon] Phase 9`
- `koklo marketplace` — `[coming soon] Phase 11`
- `koklo voice` — `[coming soon] Phase 8`

### TypeScript packages — echo stubs only

- `packages/ui` — `build`, `lint`, `typecheck` scripts are literally `echo building @koklo/ui`
- `packages/constellation` — same
- `packages/trpc-client` — same; there is no real tRPC client, no Tauri IPC bridge

### CI partially wired

- The `frontend-checks` CI job runs `pnpm run build`, which just prints echo strings and exits 0 — **it is not actually building or checking anything meaningful** (false green on every PR)

---

## 3. WHAT IS ONLY IN THE README / PLANNED

These have **zero functional code**:

| Feature | Roadmap Phase | Status |
|---|---|---|
| Desktop app UI | Phase 0 | Blank Tauri window; README describes full GUI |
| Constellation view | Phase 9 | "Stellar map" linking git commits to AI sessions — no code |
| Voice input (Whisper.cpp) | Phase 8 | Not started |
| Cloud sync / CRDT collaboration | Phase 12 | No code |
| Agent marketplace | Phase 11 | No code |
| Multi-cloud deploy | Phase 10 | No code |
| SSO / audit / on-prem (enterprise) | Phase 13 | `crates/core` has trait stubs only |
| `apps/web` | — | Directory does not exist |
| `apps/sync-server` | — | Directory does not exist |
| Gemini provider | — | Listed in README, not in `crates/providers` |

---

## 4. CODE QUALITY SNAPSHOT

### Test coverage

**281 unit tests, 0 failures.**

| Crate | Tests |
|---|---|
| `koklo-providers` | ~155 |
| `koklo-workflow-engine` | 45 |
| `koklo-storage` | 28 |
| `koklo-cli` (args/dispatch) | 14 |
| `koklo-ticket-system` | 10 |
| `koklo-agent-runtime` | 9 |
| `koklo-shell` | ~8 |
| `koklo-git-engine` | ~5 |
| `koklo-doc-generator` | ~8 |

Coverage gaps:
- **Zero tests in `apps/cli/src/commands/`** — all command handlers are untested
- **No end-to-end pipeline test** with a mock LLM — the main user flow has no automated validation
- E2E Playwright config exists (`tests/e2e/smoke.spec.ts`), run status unconfirmed

### CI/CD

- Full GitHub Actions: boundary check → `cargo fmt` → `cargo clippy -D warnings` → `cargo test --workspace`
- Automated semver tagging and GitHub release creation on merge to `main`
- **TypeScript CI job is fake** — echo scripts pass unconditionally; this is a false green

### Critical bugs / blockers

1. **No integration test for the happy path.** A new dev cloning the repo sees 281 passing tests but cannot tell if `koklo run` actually works without a live LLM configured.
2. **`crates/core` is vestigial.** Declares `models` and `traits` but actual shared types live in downstream crates. Dead weight or an unfinished refactor.
3. **No install path for external users.** No `cargo install --git`, no binary releases in CI, no Homebrew tap, no Docker image. New users must clone and `cargo build --release` manually.
4. **Monitor TUI is the freshest code** (last 5 commits focused on it, including clippy warning fixes) — least battle-tested component.

---

## 5. HONEST MATURITY SCORES

| Dimension | Score | Reasoning |
|---|---|---|
| **CLI usability** (can a new dev install and run it today?) | **4 / 10** | Compiles and runs, but requires a live LLM provider + API key configured out-of-band; no install path, no onboarding UX, no "hello world" experience |
| **Architecture solidity** (will it hold when features are added?) | **7 / 10** | Trait-based polymorphism, event bus, layered crates — the design is sound. Vestigial `core` crate and disconnected TypeScript layer are the main weak points |
| **Documentation completeness** | **6 / 10** | README is well-written at the vision level; ADRs and sprint docs exist. Missing: end-to-end "getting started" tutorial, per-command reference, provider configuration guide |
| **Overall readiness for first external user** | **3 / 10** | The backend works but there is no usable product surface for someone not reading the source code. No binary distribution, no GUI, and `koklo run` silently fails with no LLM config |

---

## 6. THE 3 MOST IMPACTFUL THINGS TO BUILD NEXT

### Priority 1 — An end-to-end "zero-config" experience

Right now a new user must: clone, build Rust (5–10 min), configure a provider, know which preset to pick, and understand what `koklo run feature "my task"` means. Drop-off at each step is near 100%.

**Build a guided `koklo start` command that:**
- Detects whether any LLM provider is reachable
- Defaults to Ollama if available, or prompts for an API key
- Picks the `light` preset as default
- Creates a first session with clear output

Pair with a `cargo install --git` one-liner in the README and you have an actual install path.

### Priority 2 — A real integration test for the happy path

281 unit tests exist but none exercise `koklo run` end-to-end. The risk: a refactor in `workflow-engine` breaks the TUI gate handshake, or a provider config change silently skips agent calls, and nothing catches it.

**Build one integration test with a mock LLM provider** (a tiny HTTP server returning canned responses) that runs a `light` preset through all 3 phases and asserts the session reaches `completed` status in SQLite. This also gives contributors a living specification of what "working" means.

### Priority 3 — Fix the TypeScript CI and wire a minimal desktop shell

The desktop app is the only surface that can reach non-developer users, and the current state is a blank Tauri window backed by fake CI.

**The gap isn't feature complexity — it's a missing IPC bridge and one React page:**
- Build `packages/trpc-client` as a real Tauri invoke wrapper
- Build a single "Sessions" screen (list sessions, trigger a run, show live transcript)
- This makes Koklo shippable to a non-CLI audience and forces TypeScript CI to become real, removing the false green

---

## Bottom Line

The Rust backend is the project's genuine asset — well-structured, tested, and further along than the version number suggests. The project stalls at the distribution and onboarding layer. **No one outside the team can successfully use this today** — not because it doesn't work, but because there is no path from "zero" to "first successful run" that doesn't require reading the source code.
