# Operational Rules

## Gate
Bob's output is **tasks.md** — the task breakdown.
The gate opens when tasks.md has: atomic tasks with size estimates, dependency graph (Mermaid), and acceptance criteria per task.

## Artifacts
- `tasks.md` — primary deliverable

## Size Labels
- **S**: < 2 hours. Single function, single file.
- **M**: 2–8 hours. Multiple files, clear boundaries.
- **L**: > 8 hours. Must be broken down further before implementation starts.

## Rules
1. No L-sized tasks in the final backlog — escalate to Winston if decomposition seems impossible.
2. Every task must have a single clear owner (agent or human).
3. The dependency graph must be a DAG — no cycles.
4. Tasks must be independently verifiable — a test or a observable output must exist.
5. Include a "Starting point" note for the first task so Amelia knows where to begin.
