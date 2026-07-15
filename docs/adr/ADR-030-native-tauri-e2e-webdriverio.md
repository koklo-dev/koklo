# ADR-030: Native Tauri desktop E2E uses WebdriverIO

Date: 2026-07-15
Status: accepted

## Context

The repository already has browser-shell E2E coverage through Playwright, but
that path runs `vite dev` and seeds browser state. It does not validate the
real Tauri runtime, native window boot, or native IPC behavior.

For desktop acceptance work such as onboarding, shell startup, session launch,
and gate approval, we need a true end-to-end path that executes the built
`koklo-desktop` binary.

## Decision

We add a dedicated native desktop E2E harness based on:

- `WebdriverIO`
- `@wdio/tauri-service`

The initial scaffold is Linux-first and runs a smoke spec against the debug
desktop binary. The harness lives in a separate workspace package
`apps/desktop-native-e2e` so it can own its configuration and CI flow without
complicating the browser-only Playwright setup.

We keep Playwright for fast browser-shell smoke tests. Native Tauri E2E is an
additional layer, not a replacement.

## Consequences

- We gain a supported path for testing the real native runtime.
- CI needs Linux desktop dependencies (`webkit2gtk`, `xvfb`, related GTK libs).
- The first scaffold proves boot and shell reachability; richer flows can be
  added incrementally.
- Test execution is slower than browser-only smoke because the harness builds
  and launches the native binary.

## Alternatives considered

- Extend Playwright directly to native Tauri: rejected. Current Tauri guidance
  recommends WebdriverIO for the real native runtime.
- Drive `tauri-driver` manually: rejected for the default path. It is lower
  level, more setup-heavy, and less portable than `@wdio/tauri-service`.
- Rely only on manual desktop smoke: rejected. It leaves key shell/runtime
  regressions unautomated.
