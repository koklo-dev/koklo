<!-- generated-by: /init-project | adapt to detected stack when possible -->
<!-- vars: STACK, COVERAGE_TOOL, TODAY_ISO -->
# Engineering Standards

> Non-negotiable standards for this project. Agents refuse to ship code that violates blocking rules.
> Last updated: 2026-06-01

## 1. Clean Architecture (blocking)

**Rule**: Dependencies point inward. Outer layers depend on inner layers, never the reverse.

Layers (adapted to Rust workspace + Tauri 2 desktop + TypeScript/React pnpm workspace):
- **Domain** — pure business logic, no framework imports
- **Application** — use cases, orchestrates domain
- **Infrastructure** — DB, HTTP clients, external APIs
- **Interface** — controllers, CLI, UI adapters

Enforcement:
- Domain must not import from Application, Infrastructure, or Interface
- Application must not import from Infrastructure or Interface
- Violations are blocking — QA Reviewer refuses the PR

If the project already uses a different architecture, document it here and keep the dependency-rule principle.

## 2. Test coverage (blocking)

- Minimum line coverage: **80%**
- Minimum branch coverage: **70%**
- New code in a PR: **90%** line coverage minimum
- Coverage drop vs main: **blocks** the PR

Measured with: `bash scripts/coverage.sh` (Rust: `cargo-llvm-cov`, enforces the 80% line minimum; see [[decisions/ADR-024-coverage-tooling]]). TypeScript coverage is deferred to the P2 frontend (tracked in [[sprints/backlog#Tooling & Gates (E0 baseline)]]).

## 3. Conventional Commits + SemVer (blocking on commit)

Format: `<type>(<scope>): <description>`

Allowed types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `style`, `perf`, `ci`, `build`.

Examples:
- `feat(auth): add passwordless login`
- `fix(billing): correct VAT calculation for EU customers`
- `refactor(auth): extract token validation, remove dead branch`

Versioning:
- `feat` → minor bump
- `fix` → patch bump
- Breaking change (`!` after type or `BREAKING CHANGE:` in body) → major bump

## 4. Trunk-based branching (blocking)

- One long-lived branch: `main` (always deployable)
- Short-lived feature branches: max **2 days** before merge
- PRs: max **400 lines** of diff (hard review limit)
- Feature flags for incomplete features merged to main

## 5. ADRs for stack changes (blocking)

Required when: adding a new library (non-patch), changing data store, changing architecture style, changing auth provider, changing deployment target.

Location: `.project/decisions/ADR-NNN-<slug>.md`

Template:
```
# ADR-NNN: <title>
Date: <date>
Status: proposed | accepted | superseded

## Context
## Decision
## Consequences
## Alternatives considered
```

## 6. Accessibility (blocking for UI work)

- WCAG 2.1 AA for all user-facing interfaces
- All interactive elements keyboard-accessible
- All images have meaningful `alt` text (or `alt=""` if decorative)
- Colour contrast ratio ≥ 4.5:1 for text, ≥ 3:1 for large text/UI
- Form inputs have associated labels
- Semantic HTML (headings in order, landmark roles)

Tested with: axe-core or equivalent in CI.

## 7. Security baseline (blocking)

- **No secrets in code** — enforced by pre-commit hook + CI secret scanning
- **Dependency audit** on every PR — no critical or high vulnerabilities
- **OWASP Top 10** reviewed for every user-input surface:
  - Injection (validate + parameterise)
  - Broken auth (MFA option, secure sessions)
  - Sensitive data (TLS, encryption at rest for PII)
  - XXE / SSRF (disable external entities, allowlist hosts)
  - Broken access control (authorisation on every protected route)
  - Misconfig (hardened defaults, no debug in prod)
  - XSS (escape output, CSP)
  - Insecure deserialisation
  - Known vulns (automated audit)
  - Insufficient logging (see §8)

## 8. Observability (blocking for new services)

- **Structured logs**: JSON, one event per log line
- **Required fields**: timestamp (ISO 8601), level, service, trace_id, message, context
- **Error tracking**: every unhandled exception → tracker (e.g. Sentry)
- **Metrics**: request rate, error rate, p50/p95/p99 latency per endpoint
- **Health endpoints**: `/health` (liveness) and `/ready` (readiness)

## 9. Active Refactoring (core principle)

**Active refactoring is part of every task — never a separate sprint.** On every file touched by the current task, the developer must:

- **Eliminate duplication**: near-identical functions in the same module are merged or extracted.
- **Remove dead code**: unreferenced symbols, unused branches, commented-out code, over-abstractions with a single caller.
- **Fix obviously optimisable code**: O(n²) loops over already-indexed data, redundant DB roundtrips, repeated parses of the same input.
- **Human readability**: speaking names; no cryptic one-liners; comments only for the *why* that the code can't already express.
- **File-size ceiling per language** (touched files only):

  | Language | Target | Warning (split required) |
  |---|---|---|
  | Python, JavaScript, TypeScript, Ruby, Kotlin | 300 | 400 |
  | Rust, Swift | 350 | 450 |
  | Go, Java, C#, C++ | 400 | 550 |
  | HTML, JSX/Vue/Svelte templates, YAML config | 500 | 700 |
  | SQL migrations, fixtures, snapshots | unlimited | — |

**Mode (hybrid)**:
- **Touched files**: above the target threshold → advisory but the developer acts; above the warning threshold → blocking, must split before merge.
- **Untouched files**: silent. No out-of-scope opportunistic refactors. Surface them as backlog items if useful, do not act.

The lines saved by an opportunistic refactor count inside the current task's diff. Use a separate `refactor:` Conventional Commit when it improves PR readability, or fold it into the main `feat:`/`fix:` commit otherwise.

## 10. Advisory standards (non-blocking)

These are enforced by the QA Reviewer in a warning mode. Agents should fix them but a single advisory failure does not block the PR.

- Naming: `camelCase` for variables/functions, `PascalCase` for types/classes, `SCREAMING_SNAKE` for constants
- Max function length: 50 lines (warning beyond)
- Documentation: every exported symbol has a docstring/JSDoc
- Magic numbers: replace with named constants

## Enforcement summary

| Rule | Mode | Gate |
|---|---|---|
| Clean architecture | Blocking | Pre-commit, PR review |
| Test coverage (80% / 90% new) | Blocking | CI |
| Conventional Commits | Blocking | commit-msg hook |
| Trunk-based + PR size | Blocking | PR review |
| ADR for stack changes | Blocking | PR review |
| Accessibility (WCAG AA) | Blocking (UI) | CI (axe) |
| Security baseline | Blocking | CI + pre-commit |
| Observability | Blocking (services) | PR review |
| Active refactoring (touched files) | Blocking above warning threshold / Advisory at target | Dev + QA review |
| Naming / function length / docs | Advisory | PR review |
