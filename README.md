<div align="center">

<!-- LOGO -->
<img src="assets/koklo-logo.svg" alt="Koklo Logo" width="120" />

# KOKLO

### The OS for AI-Assisted Software Development

**From idea to deployment — zero frustration, full control.**

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![GitHub Stars](https://img.shields.io/github/stars/koklo-dev/koklo?style=social)](https://github.com/koklo-dev/koklo/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/koklo-dev/koklo?style=social)](https://github.com/koklo-dev/koklo/network/members)
[![Discord](https://img.shields.io/discord/XXXXXXXXX?color=7289da&label=Discord&logo=discord&logoColor=white)](https://discord.gg/koklo)
[![Contributors](https://img.shields.io/github/contributors/koklo-dev/koklo)](https://github.com/koklo-dev/koklo/graphs/contributors)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/koklo-dev/koklo/blob/main/CONTRIBUTING.md)

[Website](https://koklo.dev) · [Docs](https://docs.koklo.dev) · [Discord](https://discord.gg/koklo) · [Roadmap](https://github.com/koklo-dev/koklo/projects/1) · [Contributing](CONTRIBUTING.md)

<br />

<!-- HERO VISUAL -->
<img src="assets/koklo-hero-screenshot.png" alt="Koklo Desktop App" width="680" />

<br />

</div>

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

### Prerequisites

- **Rust** ≥ 1.75
- **Node.js** ≥ 20
- **pnpm** ≥ 9

### Install & Run

```bash
# Clone the repository
git clone https://github.com/koklo-dev/koklo.git
cd koklo

# Install dependencies
pnpm install

# Run the desktop app in development mode
pnpm dev
```

That's it. Koklo detects your project, suggests a preset, and you're ready to go.

### Or use the CLI directly

```bash
# Install the CLI
cargo install --path apps/cli

# Initialise in an existing project (auto-detects stack, creates .koklo/pipeline.toml)
koklo init

# Run a pipeline — choose your methodology
koklo run feature "Auth JWT"                    # SDD (default, 5 phases)
koklo run --preset bmad    feature "Add OAuth2" # BMAD Method (8 phases)
koklo run --preset speckit feature "Refactor"  # GitHub Spec Kit (6 phases)
koklo run --preset light   task    "Fix typo"  # Minimal (3 phases)
```

→ **[Full CLI reference →  apps/cli/README.md](apps/cli/README.md)**

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

Premium features located in the `ee/` directory are covered by the [Koklo Commercial License](ee/LICENSE).

See [Licenses & CLA](docs/licenses.md) for full details.

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