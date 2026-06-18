# ADR-021: Keep `crates/core` as the open-core/EE boundary; remove dead dependencies

Date: 2026-06-13
Status: accepted

## Context

The P1 roadmap (§6 "Fix `crates/core` — supprimer le code mort", task sprint-005 US-010)
was framed on the 2026-05-05 maturity assessment, which described `crates/core` as ~98
lines of substance-free stubs and recommended deleting it (Option A) or backfilling it with
deduplicated shared types (Option B).

A fresh audit (2026-06-13) shows that premise is **obsolete**:

- `crates/core` is now **349 lines** across 11 files: shared id models (`ProjectId`,
  `SessionId`, `FeatureTitle`) plus seven extension-trait seams — `TierResolver`,
  `ScopeResolver`, `StorageExtension`, `SsoProvider`, `CollabProvider`, `AuditProvider`,
  `DeployProvider`, each with a Community-edition no-op/default impl.
- The private `koklo-ee` workspace **consumes every one of these seams**:
  `SamlSsoEngine` (ee-sso), `LicenseTierResolver` + `OrgScopeResolver` +
  `CloudSyncStorageExtension` (ee-cloud-sync), `EnterpriseAuditEngine` (ee-audit),
  `CrdtCollabEngine` (ee-collab-crdt) all `impl` traits from `koklo_core::traits::*`.

So `crates/core` is **not dead code** — it is the deliberate open-core ⇄ enterprise contract.
Deleting it (Option A) would break the entire EE build.

The genuine dead artifact is elsewhere: three open-core crates declare a `koklo-core`
dependency but **no `.rs` file in the open-core repo references `koklo_core`**. Those
dependencies are unused and create a misleading "this crate wires in the core boundary"
signal — exactly the kind of false quality signal Sprint 005 exists to remove.

## Decision

1. **Keep `crates/core`.** It is the published open-core boundary that `koklo-ee` implements.
   Reject Option A (delete). Reject Option B as framed (no real cross-crate duplication exists
   to consolidate today).
2. **Remove the three unused `koklo-core` dependencies** from the open-core repo:
   - `crates/storage/Cargo.toml`
   - `apps/cli/Cargo.toml`
   - `apps/desktop/src-tauri/Cargo.toml`
3. **Defer wiring the extension points into open-core** (e.g. `storage` accepting a
   `StorageExtension`, a `ScopeResolver` for multi-tenant queries). That is EE-integration
   work, out of P1 scope; tracked as a backlog follow-up.

## Consequences

- Positive: the dependency graph now reflects reality — only crates that use the boundary
  depend on it (today: none in open-core; `koklo-ee` depends on it directly by path).
- Positive: no source change, no API change; `cargo check`, `clippy`, the boundary check,
  and `koklo-core` standalone build all stay green. `koklo-ee` is unaffected (it depends on
  `crates/core` directly, not transitively through storage/cli/desktop).
- Positive: keeps the EE seam intact, so cloud-sync/SSO/audit/collab integration needs no
  re-scaffolding later.
- Negative: when open-core later wires `StorageExtension`/`ScopeResolver`, the `koklo-core`
  dependency must be re-added to `storage` (and possibly `cli`). Accepted: re-adding a used
  dependency is correct; carrying an unused one to pre-empt it is not.
- Negative: `crates/core` remains exercised only by the EE workspace, so open-core CI does
  not cover its trait impls. Acceptable — the Community no-op impls are trivial; EE CI covers
  the real impls.

## Alternatives considered

- **Option A — delete `crates/core`**: rejected. Breaks `koklo-ee`, which implements all
  seven trait seams; would also violate the open-core design (the boundary must live in the
  public AGPL crate so EE can depend on it).
- **Option B — backfill with deduplicated shared types**: rejected as framed. No painful
  cross-crate duplication exists right now; the crate already holds the right shared types.
- **Keep the unused dependencies as forward-looking intent**: rejected. Unused dependencies
  are a false signal and dead weight; re-add when a real consumer lands.

## Notes

This ADR lives in the repo (`docs/adr/`, alongside ADR-001) because it governs repo code
(the crate and three `Cargo.toml` files). Higher-numbered decisions (ADR-022..025) live in
the Obsidian vault `decisions/`. The split convention is logged as a backlog follow-up.
