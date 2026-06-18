# Contributing to Koklo

Thanks for helping build Koklo. This guide covers the local checks you are
expected to run before opening a PR, with a focus on the **P1 happy-path
end-to-end test** that protects the MVP `koklo run` flow.

## Prerequisites

- **Rust** (stable toolchain) with `cargo` — the only requirement for the CLI
  and its tests.
- **git** on your `PATH` — the happy-path test shells out to a real `git`
  binary to build its fixture repository.
- Node.js / pnpm are only needed when touching the TypeScript packages or the
  desktop app, not for the Rust test suite.

## Quality gates (run before every PR)

These mirror the CI jobs in `.github/workflows/ci.yml`. CI will fail without
them, so run them locally first:

```bash
cargo fmt --all -- --check                                  # formatting
cargo clippy --all-targets --all-features -- -D warnings    # lint (CI-strict)
cargo test --workspace                                      # all tests (incl. happy-path)
bash scripts/check-boundary.sh                              # open-core boundary
bash scripts/audit.sh                                       # dependency audit
bash scripts/coverage.sh                                    # coverage (enforces 80% locally)
```

## The happy-path E2E test

`apps/cli/tests/happy_path.rs` drives the **real `koklo` binary** through the
light preset against a deterministic **mock LLM provider** — no network, no
model, no API key. It asserts that a session completes, generates artifacts,
and is placed on a dedicated `koklo/session/...` branch.

### Run it locally

The test is part of the workspace suite and runs with a plain:

```bash
cargo test --workspace
```

To run only this test (the same invocation CI pins as a named gate):

```bash
cargo test -p koklo-cli --test happy_path
```

You do **not** need to export any environment variables: the test sets up its
own fully isolated environment (`KOKLO_HOME`, `KOKLO_DB_PATH`,
`KOKLO_PROVIDER=mock`, `KOKLO_ALLOW_MOCK_PROVIDER=1`) inside tempdirs, so it
never touches your real `~/.koklo`.

### The mock provider

The mock LLM is **opt-in and never auto-detected**. It is only available when
`KOKLO_ALLOW_MOCK_PROVIDER=1` is set *and* `mock` is explicitly selected as the
provider (via `KOKLO_PROVIDER=mock` or `.koklo/pipeline.toml`). It is
deliberately absent from provider auto-detection (`crates/providers/src/detect.rs`)
so it can never leak into a real user run.

### In CI

The workspace test step (`cargo test --workspace`) already executes this test.
CI additionally pins an explicit **"Happy-path E2E (mock LLM)"** step in the
`rust-checks` job so a happy-path regression is immediately visible in the CI
summary rather than buried in the full-suite output.

## Flake risks and mitigations

This test spawns subprocesses, touches SQLite, and runs `git`, so it is the
most flake-prone test in the suite. Known risks and the mitigations already in
place:

| Risk | Mitigation |
|---|---|
| **Shared `~/.koklo` / global DB state** between runs | Every run is isolated under tempdirs via `KOKLO_HOME` and `KOKLO_DB_PATH`; the test never reads or writes the developer's real config or database. |
| **Process-global env races** (a parallel test mutating env such as `OPENROUTER_API_KEY` leaking in) | The test pins `KOKLO_PROVIDER=mock` explicitly and the run is provider-deterministic; ambient `CI` and `GITHUB_TOKEN` are removed with `env_remove` so no external integration is triggered. |
| **Missing git HEAD** — the session branch step needs `git rev-parse HEAD` | The fixture commits an initial `README.md` before `koklo run`, guaranteeing a HEAD to branch from. |
| **Missing git identity** on a fresh machine/runner | The fixture sets repo-local `user.email` / `user.name`, so it does not depend on a global git config. |
| **Non-deterministic LLM output** | The mock provider returns canned, model-free output — there is no network call and no sampling variance. |
| **CI-only environment leakage** (`CI=true`, tokens) changing behaviour | Both `CI` and `GITHUB_TOKEN` are unset for the spawned `koklo` process so local and CI behaviour match. |

If you change this test, keep these invariants: full tempdir isolation, a
committed HEAD before `koklo run`, no reliance on ambient env, and the mock
provider opt-in only — never wired into auto-detection.

## Commit & PR conventions

- **Conventional Commits** (`feat`, `fix`, `chore`, `docs`, `test`, `ci`, …) —
  enforced on commit.
- **Trunk-based**: short-lived branches, PRs ≤ 400 lines of diff.
- New libraries require an ADR under `.project/decisions/`.
- Public AGPL code must never reference `koklo-ee` / `koklo_ee` / `"ee"` — the
  boundary check enforces this.
