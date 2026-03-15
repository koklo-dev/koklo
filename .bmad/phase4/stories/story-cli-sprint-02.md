# Story: CLI Sprint 02 — LLM Providers + Sandbox

## Status: Implemented

## Acceptance Criteria
- [ ] `cargo test -p koklo-providers` passes (unit tests)
- [ ] `cargo test -p koklo-shell` passes (sandbox tests)
- [ ] AnthropicProvider compiles and has correct SSE parsing logic
- [ ] OllamaProvider compiles and has correct streaming logic
- [ ] LandlockSandbox and BubblewrapSandbox compile

## Tasks Completed
- [x] LlmProvider trait + Message types
- [x] AnthropicProvider (SSE streaming)
- [x] OllamaProvider (ndjson streaming)
- [x] LandlockSandbox (read-only, env-clear)
- [x] BubblewrapSandbox (rw, bwrap fallback)
- [x] ControlledShell (human confirmation before exec)
