---
title: API contract
audience: technical
doc_version: 0.1.0
status: draft
last_reviewed: 2026-10-27
covers_release: unreleased
sources: []
covers_commit: 476c046
---
# API contract

The contract lives in `packages/contract` (`@koklo/contract`, tag `contract`). It is
written with oRPC v2 (`@orpc/contract`) and Zod; the OpenAPI document is generated from
it. `apps/api` (NestJS + `@orpc/nest`) implements it; see [ADR 0002](adr/0002-project-port-in-api.md).

## Exposed resources and operations

| Operation | Method | Path | Auth | Notes |
|-----------|--------|------|------|-------|
| `health` | GET | `/health` | none (public) | Database reachability and deployed version (`APP_VERSION`, `dev` by default) |
| `project.list` | GET | `/projects` | session (declares `UNAUTHORIZED`, `FORBIDDEN`) | Lists the projects of the caller's organization |

Method and path are explicit on every route, via `.meta(openapi({ method, path }))`
(oRPC v2 syntax; `src/contract.ts`). The router shape is
`{ health, project: { list } }`.

## Inputs, outputs and error shapes

Schemas are in `packages/contract/src/schemas.ts`:

| Operation | Input | Output |
|-----------|-------|--------|
| `health` | `{}` (empty object) | `{ status: "ok", version: string }` |
| `project.list` | none | array of `{ id: uuid, name: string }` (no project key: the CDC defines none) |

TypeScript types are exported from the package index: `HealthInput`, `HealthOutput`,
`ProjectListOutput`. Pagination and filtering: none defined (ASSUMPTION: to be added by
a later ticket).

Typed errors are declared in the contract (`src/errors.ts`); each route exposes only the
ones it lists:

| Code | HTTP status | Data | `health` | `project.list` |
|------|-------------|------|----------|----------------|
| `INTERNAL` | 500 | `{ requestId: string }` | yes | yes |
| `UNAUTHORIZED` | 401 | none | no | yes |
| `FORBIDDEN` | 403 | none | no | yes |

In the generated OpenAPI, the `INTERNAL` payload is the component schema `Internal`.

## Authentication and authorization
`project.list` requires a session (TK-11, [ADR 0003](adr/0003-better-auth-session-guard.md)).
`apps/api` mounts Better Auth on `/api/auth/*` (GitHub OAuth sign-in and callback, sign-out);
these routes belong to Better Auth, not to the oRPC contract. The session is a signed Better
Auth cookie.

A per-procedure Nest guard (`SessionGuard`, `@UseGuards` on `ProjectController.list`; not
global) resolves the session before the service runs. The request is refused with the typed
`UNAUTHORIZED` error (401, body `{ code, status, message, ... }`) when:

- there is no cookie, or it is unknown, forged or expired;
- the session has no active organization;
- the user is not a member of the active organization (checked in the `member` table).

The organization used for the query comes only from the resolved session
(`SessionOrganizationContext`); an organization sent by the client (header, query, body) is
ignored. `FORBIDDEN` is declared but not emitted. The repository port has no "list
everything" method: every read is filtered by `organizationId`. The Prisma tenant-filter
extension of CDC §18.4 does not exist yet.

Test session (e2e only): when `APP_ENV=test`, the header
`x-test-session: <userId>:<organizationId>` is accepted (exactly two non-empty segments,
otherwise 401). In any other `APP_ENV` the test resolver is not registered and the header
is ignored.

`GET /health` and `GET /openapi.json` are public. When the database does not answer within 2 s, `/health` returns `INTERNAL` (500) with `requestId` (`x-request-id` if given, otherwise a UUID); no connection detail is exposed.

## OpenAPI generation
`generateOpenApi()` (`src/openapi.ts`) is pure (no I/O) and returns an OpenAPI 3.1.0
document titled `Koklo API`, whose `info.version` is `CONTRACT_VERSION`
(`src/version.ts`). Object keys are sorted recursively so the output is deterministic.
Error statuses are derived from the contract's own error maps, not written twice.

| Artifact | Role |
|----------|------|
| `packages/contract/openapi/openapi.json` | Reference document, committed |
| `packages/contract/openapi/versions.json` | Map `version → sha256` of the document |
| `packages/contract/scripts/generate-openapi.ts` | Writes both files (`pnpm --filter @koklo/contract openapi:generate`) |

```mermaid
sequenceDiagram
  actor C as Client
  participant A as API (apps/api)
  C->>A: GET /projects
  alt ok
    A-->>C: 200 [{ id, name }]
  else no session
    A-->>C: 401 UNAUTHORIZED
  else forbidden
    A-->>C: 403 FORBIDDEN
  else failure
    A-->>C: 500 INTERNAL { requestId }
  end
```

## Compatibility and breaking changes
The OpenAPI document must not change without a version change (TK-9 acceptance
criterion). Contract tests (`packages/contract/test/contract.test.ts`) fail when:

- the generated document differs from `openapi/openapi.json`;
- `info.version` differs from `version` in `package.json`;
- the sha256 of the generated document differs from the entry for the current version
  in `openapi/versions.json`.

To change the contract: bump the version in `package.json` **and** `src/version.ts`, run
`pnpm --filter @koklo/contract openapi:generate`, commit the regenerated files.
`versions.json` only gains lines. Deprecation window and migration policy: TO DOCUMENT.

oRPC packages are pinned to `2.0.0-beta.46`: it is the only published line offering
`.meta(openapi(...))` (stable 1.16.1 uses `.route()`). Replace with 2.0 stable on release.
