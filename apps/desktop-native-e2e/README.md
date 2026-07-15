# @koklo/desktop-native-e2e

Native end-to-end smoke tests for the real Tauri desktop runtime.

## What this covers

- Launches the built `koklo-desktop` binary, not `vite dev`
- Talks to the real Tauri runtime through WebdriverIO + `@wdio/tauri-service`
- Exercises the first-launch path into the desktop shell

## Run locally

From the repo root:

```bash
pnpm test:desktop-native
```

Or directly:

```bash
pnpm --filter @koklo/desktop-native-e2e test
```

The harness builds the debug desktop binary first, then launches it through a
small wrapper that isolates `KOKLO_HOME` and `KOKLO_DB_PATH` inside a temp dir.

## Current scope

This scaffold is Linux-first. The smoke spec proves a real Tauri runtime boot
and reaches either onboarding or the Sessions shell. Broader native flows
(starting runs, approving gates, transcript timing) can layer on top of this.
