# Koklo

De l'idée à la livraison : spec, données, design, code, tests, livraison autonome et pilotage client dans un seul système.

- Cadrage (source unique) : `MyVault/koklo-v2/vision.md` (copie de `koklo-new/cadrage/koklo-cadrage-v0.7.md`)
- Backlog et sprints de construction : `MyVault/koklo-v2/sprints/` (legacy après la bascule, vision §10.9)

Le dépôt est vide de code applicatif : le workspace est posé par TK-1 (sprint 001).

<!-- generated-by: /init-project -->
## Multi-Agent Workflow

This project uses an agent-driven workflow. See:
- `.claude/CLAUDE.md` — entry point for Claude Code sessions
- `shipyard/spec/engineering-standards.md` — non-negotiable engineering rules
- `shipyard/agents/<role>/` — agent definitions and memory
- `shipyard/workflows/` — named workflow definitions
- `.project/sprints/` — backlog and sprint files
- `.project/workflows/` — persisted workflow-run artifacts and handoffs

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

Day-to-day entrypoints (`make help` lists them all):
```bash
make session   # Claude + Happy in tmux — detach with Ctrl-b then d, survives the terminal
make loop-status  # delivery loop: unit, timer, tmux
make loop-logs    # follow its output
make loop-stop    # stop the H24 loop (service stopped AND timer disarmed)
make loop-restart # bring it back
make status    # branch, sprint, loop state, sessions
```
Framework targets live in `.project/make/shipyard.mk` (regenerated on upgrade);
add your own to the root `Makefile`.
