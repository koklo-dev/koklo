# koklo CLI

Autonomous AI development pipeline — run multi-phase AI workflows from your terminal.

## Install

```bash
cargo install --path apps/cli
```

Or run directly from the workspace:

```bash
cargo run -p koklo-cli -- <command>
```

---

## Quick Start

```bash
# 1. Initialise a project (auto-detects stack, creates .koklo/pipeline.toml)
koklo init

# 2. Run a feature pipeline with the default preset (SDD)
koklo run feature "Auth JWT"

# 3. Use a different preset
koklo run --preset bmad    feature "Add OAuth2"
koklo run --preset speckit feature "Refactor storage layer"
koklo run --preset light   task    "Fix typo in README"
```

---

## Workflow Presets

Koklo ships four built-in presets. Choose the methodology that fits your project.

```bash
koklo workflow list
```

```
PRESET     NAME                           PHASES   REFERENCE
---------------------------------------------------------------------------
sdd        Spec-Driven Development        5
bmad       BMAD Method v6                 8        https://github.com/bmad-code-org/BMAD-METHOD
speckit    GitHub Spec Kit                6        https://github.com/github/spec-kit
light      Minimal ceremony               3
custom     Custom (from .koklo/workflow.toml) 5
```

### SDD — Spec-Driven Development *(default)*

```
PM (Spec) → Architect (Plan) → Developer (Implement) → QA (Test) → Reviewer (Review)
```

### BMAD — [BMAD Method v6](https://github.com/bmad-code-org/BMAD-METHOD)

```
Analyst (Analysis) → PM (Spec) → Architect (Plan) → Developer (Implement)
  → QA (Test) → Reviewer (Review) → Security (Security) → Doc-Writer (Docs)
```

### Spec Kit — [GitHub Spec Kit](https://github.com/github/spec-kit)

```
Constitution-Writer → PM (Spec) → Architect (Plan) → Task-Planner (Tasks)
  → Developer (Implement) → Reviewer (Review)
```

### Light — Minimal ceremony

```
PM (Spec) → Developer (Implement) → Reviewer (Review)
```

### Custom

Set `preset = "custom"` in `.koklo/pipeline.toml` and place your phase list in
`.koklo/workflow.toml`. Falls back to SDD if the file is absent.

---

## Command Reference

### `koklo init [PATH] [--preset P] [--yes]`

Initialise Koklo in the current project. Detects your stack and suggests a preset.

```bash
koklo init                        # interactive, auto-detect stack
koklo init --preset bmad --yes    # non-interactive, BMAD preset
koklo .                           # alias: init from current dir
```

Creates `.koklo/pipeline.toml` with sensible defaults. Idempotent — safe to run twice.

---

### `koklo run [--preset P] <type> <title>`

Start a new pipeline. Supported types: `feature`, `task`, `bug`.

```bash
koklo run feature "Auth JWT"                   # SDD (default)
koklo run --preset bmad    feature "Add OAuth2"
koklo run --preset speckit feature "Refactor storage"
koklo run --preset light   task    "Fix typo"
```

If `GITHUB_TOKEN` is set, the Review phase creates a PR on the configured repository.
A human gate (`[y/N]`) appears between each phase.

---

### `koklo session`

Manage pipeline sessions.

```bash
koklo session list              # list all sessions with preset + status
koklo session show <id>         # phases, timing, artifacts for a session
koklo session resume <id>       # resume from last incomplete phase

# Backward-compat aliases
koklo status                    # → session list
koklo status <id>               # → session show <id>
koklo resume <id>               # → session resume <id>
```

---

### `koklo agent`

Browse and run built-in agents.

```bash
koklo agent list                  # list all agents + prompt file paths
koklo agent show security         # print the security agent's system prompt
koklo agent run pm --input "Add user auth feature"
koklo agent run architect         # reads input from stdin
```

**Built-in agents:**

| Agent | Presets | Role |
|-------|---------|------|
| `pm` | All | Product spec (`spec.md`) |
| `architect` | All | Technical plan (`plan.md`) |
| `developer` | All | Code implementation |
| `qa` | SDD, BMAD | Test suite |
| `reviewer` | All | Code review + PR (`review.md`) |
| `analyst` | BMAD | Business analysis (`analysis.md`) |
| `security` | BMAD | OWASP security report (`security-report.md`) |
| `doc-writer` | BMAD | README / CHANGELOG / ADR updates |
| `constitution-writer` | Spec Kit | Project constitution (`CONSTITUTION.md`) |
| `task-planner` | Spec Kit | Atomic task decomposition (`tasks.md`) |

Agent prompts live in `agents/built-in/<name>.md`. Edit them to customise behaviour without recompiling.

---

### `koklo workflow`

Inspect presets.

```bash
koklo workflow list
koklo workflow show bmad
# → BMAD Method v6 — Agile framework with expert agents (8 phases)
# → Reference: https://github.com/bmad-code-org/BMAD-METHOD
# → analysis (analyst) → spec (pm) → plan (architect) → ...
```

---

### `koklo config`

View or update project configuration.

```bash
koklo config show                         # print .koklo/pipeline.toml
koklo config init --preset speckit --yes  # recreate with Spec Kit preset
```

---

### `koklo artifacts`

Browse phase outputs stored in the database.

```bash
koklo artifacts list <session-id>         # list all artifacts + file sizes
koklo artifacts show <session-id> spec    # print spec.md content
```

---

### `koklo provider`

Manage LLM provider connections.

```bash
koklo provider list              # show configured providers + key status
koklo provider test ollama       # send a test prompt, check connectivity
koklo provider test openrouter   # uses smoke_model when configured
```

API keys do not have to come from an interactive shell. Koklo loads secrets from
`$KOKLO_HOME/secrets.toml` or `$KOKLO_SECRETS_FILE` for non-interactive runs:

```toml
[env]
OPENROUTER_API_KEY = "sk-or-v1-..."
ANTHROPIC_API_KEY = "sk-ant-..."
```

---

### Future commands (coming soon)

These commands are registered and print a helpful message — they won't crash:

| Command | Phase | Description |
|---------|-------|-------------|
| `koklo tickets` | 5 | Integrated ticketing |
| `koklo ide` | 7 | IDE bridge |
| `koklo voice` | 8 | Voice input (Whisper.cpp) |
| `koklo constellation` | 9 | Git visualization |
| `koklo deploy` | 10 | Multi-provider deployment |
| `koklo marketplace` | 11 | Agent marketplace |
| `koklo sync` | 12 | Cloud collaboration |

---

## Configuration

### `.koklo/pipeline.toml`

```toml
[pipeline]
db_path       = "sqlite://koklo-sessions.db"
artifacts_dir = "docs/planning_artifacts"
agents_dir    = "agents/built-in"

[workflow]
preset = "sdd"   # sdd | bmad | speckit | light | custom

[agents.developer]
provider     = "anthropic"
model        = "claude-opus-4-6"
system_prompt = "agents/built-in/developer.md"
timeout_secs = 600
sandbox      = "bubblewrap"

[providers.anthropic]
api_key_env = "ANTHROPIC_API_KEY"

[providers.openrouter]
api_key_env = "OPENROUTER_API_KEY"
model = "openai/gpt-4o"
smoke_model = "google/gemma-3-4b-it:free"

[providers.ollama]
base_url = "http://127.0.0.1:11434"
```

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Use Anthropic (Claude) as LLM provider |
| `OPENAI_API_KEY` | — | Use OpenAI as LLM provider |
| `MISTRAL_API_KEY` | — | Use Mistral as LLM provider |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama endpoint (fallback) |
| `OLLAMA_MODEL` | `qwen2.5-coder:7b` | Local model |
| `KOKLO_HOME` | `~/.koklo` | Global Koklo config, DB, agents, secrets |
| `KOKLO_SECRETS_FILE` | `$KOKLO_HOME/secrets.toml` | Override secrets file path for non-interactive runs |
| `KOKLO_PROVIDER` | — | Override default provider by name |
| `KOKLO_PROVIDER_<AGENT>` | — | Override provider for a specific agent (e.g. `KOKLO_PROVIDER_PM=anthropic`) |
| `GITHUB_TOKEN` | — | Enable PR creation in Review phase |
| `KOKLO_GITHUB_OWNER` | `koklo-dev` | GitHub repo owner |
| `KOKLO_GITHUB_REPO` | `koklo` | GitHub repo name |
| `KOKLO_BASE_BRANCH` | `develop` | PR base branch |
| `KOKLO_DB_PATH` | `sqlite://koklo-sessions.db` | Session database path |

### Provider selection priority

```
KOKLO_PROVIDER_<AGENT> env  →  [agents.<name>] in TOML  →  KOKLO_PROVIDER env
  →  ANTHROPIC_API_KEY  →  OPENAI_API_KEY  →  MISTRAL_API_KEY  →  ollama (fallback)
```

---

## Controlled shell

Every shell command emitted by the Developer agent is shown to you **before** execution:

```
[GATE] Phase 'implement' complete. Approve? [y/N]
```

Approve with `y` to advance. Any other input pauses the session — resume later with
`koklo session resume <id>`.
