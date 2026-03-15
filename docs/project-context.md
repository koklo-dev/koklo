# Project Context — Koklo

> This file is the shared constitution for all BMAD agents. Every agent reads this at session start.
> It is maintained by the orchestrator and updated as the project evolves.

## Project Overview

**Product:** Koklo — The OS for AI-assisted software development
**Vision:** Become the standard reference for AI-assisted dev — as GitHub standardized PR/issues, Koklo standardizes the AI development workflow.

**Current Phase:** <!-- e.g., P1 Core AI -->
**Roadmap Doc:** <!-- Google Drive URL -->
**Linear Project:** <!-- Linear project URL -->

## Repositories

| Repo | Path | Stack | Purpose |
|---|---|---|---|
| `koklo` | `/home/jo/project/koklo` | Rust + TypeScript/React + Tauri | Main desktop app |
| `koklo-ee` | `/home/jo/project/koklo-ee` | TypeScript | Enterprise edition |
| `koklo-infra` | `/home/jo/project/koklo-infra` | Ansible, Docker | Infrastructure |

## Tech Stack

- **Backend:** Rust
- **Frontend:** TypeScript + React (Tauri shell)
- **Design:** Penpot (source of truth for all UI)
- **Component Library:** Storybook
- **CI/CD:** GitHub Actions
- **Task Tracking:** Linear
- **Docs:** Google Drive

## Key Principles

1. **Quality before velocity** — tests > 80%, zero visible debt
2. **Spec before code** — nothing is implemented without a prepared story
3. **Design tokens are law** — no hardcoded values in frontend
4. **ADRs for all significant decisions** — documented and reasoned

## Active Sprint

**Sprint:** <!-- e.g., Sprint 3 -->
**Goal:** <!-- 1-line sprint goal -->
**Sprint Status:** `docs/sprint-status.yaml`

## BMAD Team

| Agent | Name | Phase | Role |
|---|---|---|---|
| bmad-analyst | Mary 📊 | Phase 1 | Business Analyst — brainstorming, research, product brief |
| bmad-pm | John 📋 | Phase 2 | Product Manager — PRD, epics, stories |
| bmad-designer | Sally 🎨 | Phase 2 | UX Designer — UX spec, Penpot designs |
| bmad-architect | Winston 🏗️ | Phase 3 | Architect — architecture, ADRs, API contracts |
| bmad-sm | Bob 🏃 | Phase 4 | Scrum Master — sprint planning, story preparation |
| bmad-dev | Amelia 💻 | Phase 4 | Developer — implementation via Claude Code/Codex |
| bmad-storybook | Lumi 📖 | Phase 4 | Storybook Guardian — design/code alignment |
| bmad-qa | Quinn 🧪 | Phase 4 | QA Engineer — tests, acceptance criteria, PR approval |

## Current Feature (if any)

**Feature:** <!-- feature name -->
**Linear:** <!-- ticket URL -->
**Status:** <!-- Analyst | PM | UX | Arch | Readiness | SM | Dev | QA | Done -->
**BMAD State File:** `memory/bmad-<feature-slug>-<date>.md`
