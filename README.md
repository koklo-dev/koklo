<div align="center">

# KOKLO

### The OS for AI-Assisted Software Development

**From idea to deployment — zero frustration, full control.**

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![GitHub Stars](https://img.shields.io/github/stars/koklo-dev/koklo?style=social)](https://github.com/koklo-dev/koklo/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/koklo-dev/koklo?style=social)](https://github.com/koklo-dev/koklo/network/members)
[![Contributors](https://img.shields.io/github/contributors/koklo-dev/koklo)](https://github.com/koklo-dev/koklo/graphs/contributors)

</div>

<!-- generated-by: /init-project -->
## Multi-Agent Workflow

This project uses an agent-driven workflow. See:
- `.claude/CLAUDE.md` — entry point for Claude Code sessions
- `AGENTS.md` — entry point for Codex CLI sessions
- `/home/devops/perso/projets/MyVault/Dev/koklo/spec/engineering-standards.md` — non-negotiable engineering rules
- `/home/devops/perso/projets/MyVault/Dev/koklo/agents/<role>/` — agent definitions and memory
- `/home/devops/perso/projets/MyVault/Dev/koklo/workflows/definitions/` — named workflow definitions
- `/home/devops/perso/projets/MyVault/Dev/koklo/sprints/` — backlog and sprint files
- `/home/devops/perso/projets/MyVault/Dev/koklo/workflows/runs/` — persisted workflow-run artifacts and handoffs

Run sprint-scoped orchestration:
```text
/sprint 001
/sprint 001 US-001
```

Run direct workflow orchestration:
```text
/run-workflow analyze-design-dev-review US-001
```

Migrate an older initialized project:
```text
/upgrade-project
```

---

## The Problem

You're a developer in 2026. Your daily workflow looks like this:

**IDE** → **Copilot/Cursor** → **Jira/Linear** → **Slack** → **GitHub** → **Vercel/AWS** → **Notion** → **Postman** → repeat.

14+ tools. No AI governance. No traceability between what you asked the AI and what ended up in production. No audit trail. No control.

**Koklo fixes this.**

---

## What is Koklo?

Koklo is a **standalone desktop application** that manages your entire development lifecycle — from ideation to deployment — with AI agents you control.

It's not an IDE extension. It's not another chatbot. It's the **cockpit** where your project, your agents, and your tools come together under one roof.

```
  IDEA → STRUCTURE → DEVELOP → TEST → REVIEW → SECURITY → DOCS → DEPLOY
   │         │          │        │       │         │         │       │
   └─────────┴──────────┴────────┴───────┴─────────┴─────────┴───────┘
                          All in one place.
                     All traced. All governed.
```

---

## ✨ Key Features

🧩 **Standalone App** — Not an IDE extension. Works alongside VS Code, Cursor, Zed, Vim, or any editor.

🤖 **LLM-Agnostic Agents** — Agents defined in Markdown files. Works with Claude, GPT, Gemini, Llama, Ollama, or any LLM.

🎫 **Integrated Ticketing** — Tickets, epics, sprints, Kanban board. No more Jira. Every ticket is linked to AI sessions, commits, and PRs.

🔒 **Privacy-First** — Your data stays on your machine by default. SQLite local storage, offline-first architecture. Cloud is optional.

🌊 **Workflow Engine** — DAG-based orchestration with human gates. Presets for SDD, BMAD, or bring your own method.

🌌 **Constellation View** — A stellar map of your Git history + AI sessions. Visualize the link between what was discussed and what was coded.

🔌 **Edit in Your IDE** — One click opens the file at the right line in your preferred editor. You stay in control.

📝 **Auto Documentation** — README, API docs, changelogs, ADRs — generated and kept in sync automatically.

🚀 **Deploy Anywhere** — Abstract deployment to AWS, GCP, Vercel, Coolify, Dokploy, or your own server.

🏪 **Marketplace** — Share and discover agents, workflows, and policy packs from the community.

---

## 🚀 Quick Start

Koklo ships today as a **Rust CLI**. The desktop app is Phase 2 and not yet ready for daily use (see the [Roadmap](#️-roadmap)) — the CLI is the supported way to use Koklo now.

### Prerequisites

- **Rust** ≥ 1.75 with Cargo — install via [rustup](https://rustup.rs).
- **One LLM provider — any single one is enough.** Koklo does **not** impose a provider (Ollama is *not* required). It auto-detects the first one that's actually ready, in this exact resolution order (mirrors `crates/providers/src/detect.rs`):
  1. a running **Ollama** with the configured model pulled (`ollama pull qwen2.5-coder:7b`) — local, offline, free;
  2. a local **Claude Code** CLI, then **Codex** CLI, installed and authenticated — reuses your existing subscription, no key;
  3. an **`OPENROUTER_API_KEY`** in your environment or `~/.koklo/secrets.toml`;
  4. a provider pinned in `.koklo/pipeline.toml` or `~/.koklo/config.toml`.

  You don't pick one manually — whatever is ready wins, and a running-but-empty Ollama is skipped so detection falls through to the next option. See [Configure a provider](#configure-a-provider) to pin one explicitly.

Nothing else is required to run the CLI: no Node.js, pnpm, or Tauri/system libraries (those are only needed to hack on the desktop app).

### Install

```bash
# From a local checkout
git clone https://github.com/koklo-dev/koklo.git
cd koklo
cargo install --path apps/cli

# …or directly from Git, no clone (name the package — the repo has two binaries)
cargo install --git https://github.com/koklo-dev/koklo koklo-cli
```

Verify:

```bash
koklo --version   # koklo 0.1.0
```

### Run your first pipeline

**Recommended first run — `koklo start`.** This is the guided onboarding entry point: it detects your project, auto-detects a provider, picks the fast `light` preset, and runs a first pipeline through to a generated artifact.

```bash
koklo start
```

Prefer to drive it yourself?

```bash
# Initialise Koklo in your project (auto-detects stack, creates .koklo/pipeline.toml)
koklo init

# Run a minimal 3-phase pipeline (a self-contained task that always yields an artifact)
koklo run --preset light   task    "Add a hello world function"

# …or the default Spec-Driven Development flow (5 phases)
koklo run                  feature "Auth JWT"

# Other methodologies
koklo run --preset bmad    feature "Add OAuth2"      # BMAD Method (8 phases)
koklo run --preset speckit feature "Refactor storage" # GitHub Spec Kit (6 phases)
```

> **On presets:** `koklo init` records a preset matched to your stack in `.koklo/pipeline.toml` — `sdd` for Rust/Python/Go, `speckit` for Node. The `--preset light` flag on `koklo run` **overrides** that per-run, giving you the quickest 3-phase flow for a first run. Drop the flag to use your project's configured preset. `koklo start` always uses `light`.
>
> Pick a task that produces something on its own (like *"Add a hello world function"*) for your very first run — open-ended tasks that depend on existing files (e.g. *"fix the typo"* on an empty repo) can make agents correctly **block** instead of generating an artifact.

When the run finishes, the generated artifacts (`spec.md`, `implement.md`, `review.md`, …) are written to **`docs/planning_artifacts/`** in your project — the final summary prints the exact path.

Running headless (CI, scripting)? Add `--no-tui` to approve gates from stdin. A failed run exits non-zero so CI can detect it.

→ **[Full CLI reference → apps/cli/README.md](apps/cli/README.md)**

### Configure a provider

Koklo is LLM-agnostic. By default it **auto-detects** an available provider in this order: an Ollama server with the configured model pulled → a ready Claude Code CLI → a ready Codex CLI → an `OPENROUTER_API_KEY`. To pin one explicitly, set it per agent with a `KOKLO_PROVIDER_<AGENT>` environment variable or in `.koklo/pipeline.toml`. Resolution order per agent: `KOKLO_PROVIDER_<AGENT>` env var → `agent_providers` map in the TOML → `default_provider` → auto-detection.

The table below lists providers in auto-detection precedence order:

| Provider | Setup | Configuration |
|----------|-------|---------------|
| **Ollama** — local, offline, free | `ollama serve`, then **`ollama pull qwen2.5-coder:7b`** (Koklo skips Ollama until the model is pulled) | `OLLAMA_BASE_URL` (default `http://localhost:11434`), `OLLAMA_MODEL` (default `qwen2.5-coder:7b`) |
| **Claude Code CLI** | Install and authenticate the `claude` CLI | — (uses your existing session) |
| **Codex CLI** | Install and authenticate the `codex` CLI | — (uses your existing session) |
| **OpenRouter** — BYOK gateway | `export OPENROUTER_API_KEY=…` then `koklo provider add openrouter` | `OPENROUTER_API_KEY` |

Inspect and test what's configured:

```bash
koklo provider list
koklo provider test ollama
```

---

## 🏗️ Architecture

Koklo is built as a modular monorepo with **12 functional blocks**:

```
koklo/
├── apps/
│   ├── desktop/            # Tauri desktop application
│   ├── cli/                # koklo CLI — see apps/cli/README.md
│   ├── web/                # Web interface (cloud)
│   └── sync-server/        # Synchronization server
│
├── crates/                  # Rust backend modules
│   ├── core/               # Shared types & models
│   ├── workflow-engine/    # DAG orchestration
│   ├── agent-runtime/      # Agent execution
│   ├── providers/          # LLM abstraction (BYOK, local, gateway)
│   ├── git-engine/         # Git integration
│   ├── doc-generator/      # Auto documentation
│   ├── pr-manager/         # Pull request management
│   ├── ticket-system/      # Integrated ticketing
│   ├── deploy-abstract/    # Deployment abstraction
│   ├── voice/              # Speech-to-text (Whisper.cpp)
│   ├── collab/             # CRDT & real-time sync
│   ├── storage/            # SQLite + PostgreSQL
│   └── ide-bridge/         # IDE integration
│
├── packages/                # TypeScript frontend modules
│   ├── ui/                 # React components
│   ├── constellation/      # Git visualization
│   ├── timeline/           # Product timeline
│   └── trpc-client/        # tRPC client
│
└── agents/                  # Agent definitions (Markdown)
    ├── built-in/           # 10 built-in agents (pm, architect, developer, qa, reviewer,
    │                       #   analyst, security, doc-writer, constitution-writer, task-planner)
    └── marketplace/        # Community agents
```

### Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Desktop Framework | **Tauri 2** | Native performance, small binary, Rust backend |
| Backend | **Rust** | Safety, performance, WebAssembly-ready |
| Frontend | **TypeScript / React** | Type safety, ecosystem, developer experience |
| Local Storage | **SQLite** | Offline-first, zero config, portable |
| Cloud Storage | **PostgreSQL** | Collaboration, multi-tenant, enterprise |
| API Layer | **tRPC** | End-to-end type safety, no codegen |
| Real-time | **CRDT** | Conflict-free collaboration, offline merge |
| AI Agents | **Markdown files** | LLM-agnostic, versionable, shareable |

---

## 🤖 Agents Are Just Markdown

Koklo agents are simple `.md` files. No vendor lock-in. Version them with Git. Share them on the Marketplace.

```markdown
# agents/built-in/security.md
---
name: Senior Security Engineer
version: 1.0.0
triggers: [on_commit, on_pr, manual]
---

## Role
You are a senior security engineer...

## Capabilities
- OWASP Top 10 analysis
- CVE detection
- Fix suggestions

## Output Format
{ "vulnerabilities": [], "severity": "...", "recommendations": [] }
```

### Built-in Agents

| Agent | Preset(s) | Role |
|-------|-----------|------|
| 📋 PM | All | Product specification (`spec.md`) |
| 🏗️ Architect | All | Technical plan (`plan.md`) |
| 💻 Developer | All | Code implementation |
| 🧪 QA | SDD, BMAD | Test suite |
| 🔍 Reviewer | All | Code review + PR (`review.md`) |
| 📊 Analyst | BMAD | Business analysis, Gherkin acceptance criteria (`analysis.md`) |
| 🔒 Security | BMAD | OWASP Top 10, CVE scan, structured JSON report |
| 📝 Doc Writer | BMAD | README / CHANGELOG / ADR updates |
| 📜 Constitution Writer | Spec Kit | Project constitution & principles (`CONSTITUTION.md`) |
| 🗂️ Task Planner | Spec Kit | Atomic task decomposition with dependency graph (`tasks.md`) |

---

## 🔄 Bring Your Method

Koklo doesn't impose a methodology. It provides **presets** you can use, customize, or ignore:

- **SDD** (Spec-Driven Development) — Spec → Plan → Implement → Test → Review *(default, 5 phases)*
- **BMAD** ([BMAD Method v6](https://github.com/bmad-code-org/BMAD-METHOD)) — Analysis → Spec → Plan → Implement → Test → Review → Security → Docs *(8 phases)*
- **Spec Kit** ([GitHub Spec Kit](https://github.com/github/spec-kit)) — Constitution → Spec → Plan → Tasks → Implement → Review *(6 phases)*
- **Light** — Spec → Implement → Review *(minimal, 3 phases)*
- **Custom** — Define your own phase list in `.koklo/workflow.toml`

> *"Bring your method. Koklo adds control, traceability, and execution."*

---

## 🔐 LLM Provider Freedom

You choose how AI runs in your project:

| Option | Description |
|--------|-------------|
| **Koklo Gateway** | We route to Claude, GPT, etc. One invoice. |
| **BYOK** | Bring Your Own Keys. Use your API keys directly. |
| **Local LLM** | Ollama, LM Studio. Full privacy, offline, free. |
| **Existing Sub** | Use your Claude Pro/Team subscription. |

---

## 💰 Open Core Model

Koklo follows an **open core** model. The community edition is free and powerful. Premium features fund continued development.

| | Community | Pro | Team | Enterprise |
|---|-----------|-----|------|------------|
| **Price** | Free | $15/mo | $35/user/mo | $60/user/mo |
| **License** | AGPLv3 | Commercial | Commercial | Commercial |
| **Storage** | SQLite local | + Cloud sync | + Cloud sync | + On-premise |
| **Agents** | 8 built-in + 3 custom | Unlimited | Unlimited | Unlimited + enforced |
| **Workflows** | 3 presets | Unlimited | Unlimited | + Admin policies |
| **Collaboration** | Solo | Solo | CRDT, workspaces, RBAC | + SSO, audit, deploy |
| **Support** | Community | Email | Priority | Dedicated |

The **Community tier is not a demo**. It's a full development environment for solo developers and open source projects.

---

## 🆚 How Koklo Compares

| Feature | Copilot | Cursor | Windsurf | Devin | Kilo | **Koklo** |
|---------|---------|--------|----------|-------|------|-----------|
| Standalone app | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Integrated ticketing | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Timeline / Epics | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Auto documentation | ❌ | ❌ | ❌ | Partial | ❌ | ✅ |
| LLM-agnostic agents (MD) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Multi-provider deploy | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| On-premise option | ❌ | ❌ | ❌ | ❌ | Self-host | ✅ |
| Open source core | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Workflow governance | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Git + AI visualization | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## 🗺️ Roadmap

| Phase | What | Status |
|-------|------|--------|
| 0 — Foundation | Monorepo, CLI, Tauri base | 🔨 In progress |
| 1 — Storage | SQLite/PostgreSQL, sessions | ⏳ Planned |
| 2 — AI Gateway | Multi-provider, BYOK, tRPC | ⏳ Planned |
| 3 — Agents | Runtime, 8 built-in agents | ⏳ Planned |
| 4 — Workflows | DAG orchestration, presets | ⏳ Planned |
| 5 — Ticketing | Tickets, epics, Kanban | ⏳ Planned |
| 6 — Git & PR | Git engine, PR templates | ⏳ Planned |
| 7 — Docs & IDE | Auto docs, Edit button | ⏳ Planned |
| 8 — Voice | Whisper.cpp integration | ⏳ Planned |
| 9 — Visualization | Constellation, Timeline | ⏳ Planned |
| 10 — Deploy | Multi-provider abstraction | ⏳ Planned |
| 11 — Marketplace | Agents & workflows marketplace | ⏳ Planned |
| 12 — Collaboration | CRDT, shared sessions | ⏳ Planned |
| 13 — Enterprise | On-prem, SSO, policies | ⏳ Planned |

📋 See the full [Project Roadmap](https://github.com/koklo-dev/koklo/projects/1) for details and milestones.

---

## 🤝 Contributing

We welcome contributions of all kinds! Koklo is community-driven, and **the community is our first investor**.

### Quick Contribution Guide

```bash
# 1. Fork the repo
gh repo fork koklo-dev/koklo

# 2. Create your branch
git checkout -b feat/amazing-feature

# 3. Make your changes & commit
git commit -m "feat: add amazing feature"

# 4. Push and open a PR
git push origin feat/amazing-feature
gh pr create
```

### Ways to Contribute

- 🐛 **Report bugs** — [Open an issue](https://github.com/koklo-dev/koklo/issues/new?template=bug_report.md)
- 💡 **Suggest features** — [Start a discussion](https://github.com/koklo-dev/koklo/discussions/new?category=ideas)
- 🔧 **Fix issues** — Look for [`good first issue`](https://github.com/koklo-dev/koklo/labels/good%20first%20issue) labels
- 🤖 **Create agents** — Write Markdown agents and share them
- 📝 **Improve docs** — Typos, tutorials, translations
- 🌍 **Translate** — Help us reach developers worldwide

📖 Read the full [Contributing Guide](CONTRIBUTING.md) for setup instructions and conventions.

### Contributor Journey

Your path in the Koklo community:

```
First Issue → Contributor → Maintainer → Core Team → (Potential Employee)
```

We believe in meritocracy. Every maintainer started with a single PR.

---

## 🌐 Community

- 💬 [Discord](https://discord.gg/koklo) — Chat, help, and hangout
- 🐦 [Twitter / X](https://twitter.com/koklo_dev) — Updates and announcements
- 📝 [Blog](https://koklo.dev/blog) — Devlogs, tutorials, deep dives
- 📺 [YouTube](https://youtube.com/@koklo-dev) — Demos and community calls
- 🗳️ [GitHub Discussions](https://github.com/koklo-dev/koklo/discussions) — RFCs and proposals

---

## 📄 License

The Koklo core is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPLv3).

Premium features are covered by the [Koklo Commercial License](LICENSE-COMMERCIAL.md).

---

## 💜 Acknowledgments

Koklo is built on the shoulders of incredible open source projects:

[Tauri](https://tauri.app) · [Rust](https://rust-lang.org) · [React](https://react.dev) · [SQLite](https://sqlite.org) · [tRPC](https://trpc.io) · [Yjs (CRDT)](https://yjs.dev) · [Whisper.cpp](https://github.com/ggerganov/whisper.cpp)

---

<div align="center">

**Koklo is not another method.**
**It's the layer above all methods.**

*The OS for AI-assisted software development — where methods are presets, quality is governed, work is traceable, and the ecosystem is shareable.*

<br />

⭐ **If this vision resonates with you, give us a star!** ⭐

<br />

[![Star History Chart](https://api.star-history.com/svg?repos=koklo-dev/koklo&type=Date)](https://star-history.com/#koklo-dev/koklo&Date)

</div>
