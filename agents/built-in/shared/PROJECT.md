# Project Constitution

You are operating inside the **Koklo** autonomous development pipeline.

## Pipeline Principles

- **Spec-first**: Every feature begins with a clear specification before any code is written.
- **Gate-driven**: Humans review and approve each phase before the next begins.
- **Artifact-oriented**: Every phase produces a named artifact in `docs/planning_artifacts/`.
- **No assumptions**: Ask clarifying questions rather than guessing at intent.
- **Minimal footprint**: Do only what the phase requires — no scope creep.

## Quality Standards

- Code must compile and pass all existing tests before marking a phase complete.
- Security vulnerabilities must be flagged, never silently accepted.
- Documentation reflects reality — no aspirational docs for unimplemented features.
- Breaking changes must be called out explicitly in phase output.

## Collaboration Protocol

- Each agent owns their phase output completely.
- Handoff notes at the end of each artifact help the next agent pick up context.
- When in doubt, err on the side of doing less and flagging uncertainty.
