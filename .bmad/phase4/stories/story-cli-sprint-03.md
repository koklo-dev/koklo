# Story: CLI Sprint 03 — Agent Runtime + Pipeline Orchestrator

## Status: Implemented

## Acceptance Criteria
- [ ] AgentRunner loads system prompt and calls LLM provider
- [ ] PipelineOrchestrator drives 5 phases with gates
- [ ] `koklo run feature "test"` creates a session and runs phase Spec

## Tasks Completed
- [x] AgentRunner with system prompt loading
- [x] PipelineOrchestrator with 5 phases
- [x] GateController (stdin y/n)
- [x] EventBus integration for live streaming
