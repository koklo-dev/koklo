---
title: API contract
audience: technical
doc_version: 0.3.0
status: draft
last_reviewed: 2026-10-30
covers_release: unreleased
sources: []
covers_commit: 7f97066
---
# API contract

The contract lives in `packages/contract` (`@koklo/contract`, tag `contract`). It is
written with oRPC v2 (`@orpc/contract`) and Zod; the OpenAPI document is generated from
it. `apps/api` (NestJS + `@orpc/nest`) implements it; see [ADR 0002](adr/0002-project-port-in-api.md).

## Exposed resources and operations

Contract version **0.4.0** (TK-29). The router shape is
`{ health, organization, member, project, ticket, dependency, sprint, comment, projectState, lease, audit }`:
33 routes on 21 paths (8 from TK-21, 25 from TK-29). Method and path are explicit on every
route, via the `route(method, path)` helper (`src/route-helpers.ts`, wrapping
`.meta(openapi({ method, path }))`) used by `src/contract.ts`, `src/contract-tickets.ts` and
`src/contract-collaboration.ts`.

| Operation | Method | Path | Auth | Typed errors (besides `INTERNAL`) |
|-----------|--------|------|------|-----------------------------------|
| `health` | GET | `/health` | none (public) | none |
| `organization.create` | POST | `/organizations` | session | `UNAUTHORIZED`, `CONFLICT` |
| `organization.list` | GET | `/organizations` | session | `UNAUTHORIZED` |
| `member.invite` | POST | `/members/invitations` | session + active organization | `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT` |
| `member.list` | GET | `/members` | session + active organization | `UNAUTHORIZED` |
| `member.setRole` | PATCH | `/members/{memberId}/role` | session + active organization | `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT` |
| `project.list` | GET | `/projects` | session + active organization | `UNAUTHORIZED`, `FORBIDDEN` |
| `project.create` | POST | `/projects` | session + active organization | `UNAUTHORIZED`, `FORBIDDEN` |

The six TK-21 routes are implemented in `apps/api` (TK-23). Of the 25 TK-29 routes, the 15
ticket, dependency and sprint ones are implemented since TK-30 (see
[Tickets, dependencies and sprints (TK-30)](#tickets-dependencies-and-sprints-tk-30)); the
lease and project-state ones since TK-31 (see [Leases and project state (TK-31)](#leases-and-project-state-tk-31));
the comment and audit ones since TK-32 (see [Comments and audit log (TK-32)](#comments-and-audit-log-tk-32)). The
organisation and the project always come from the session or the server, never from the input;
a resource of another project is `NOT_FOUND` (no leak). The contract does not carry roles:
the matrix is enforced and tested in `apps/api`. "Manage" below means owner, admin, dev,
designer; "read" is open to every role (client for its own project, business). The column is
the contract's intent; the matrix actually enforced is in the TK-30 and TK-31 sections
(`ticket.delete` is currently open to every manager role, not only owner and admin).

| Operation | Method | Path | Roles (intent) | Typed errors (besides `INTERNAL`, `UNAUTHORIZED`) |
|-----------|--------|------|--------------------|---------------------------------------------------|
| `ticket.create` | POST | `/tickets` | manage | `FORBIDDEN`, `VALIDATION`, `CONFLICT` |
| `ticket.get` | GET | `/tickets/{key}` | read | `NOT_FOUND` |
| `ticket.list` | GET | `/tickets` | read | none |
| `ticket.update` | PATCH | `/tickets/{key}` | manage | `FORBIDDEN`, `NOT_FOUND`, `VALIDATION` |
| `ticket.delete` | DELETE | `/tickets/{key}` | owner, admin | `FORBIDDEN`, `NOT_FOUND`, `CONFLICT` |
| `ticket.transition` | POST | `/tickets/{key}/transition` | manage (agents and runners by token scope) | `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `INVALID_TRANSITION` |
| `dependency.add` | POST | `/tickets/{key}/dependencies` | manage | `FORBIDDEN`, `NOT_FOUND`, `DEPENDENCY_CYCLE` |
| `dependency.remove` | DELETE | `/tickets/{key}/dependencies/{dependsOn}` | manage | `FORBIDDEN`, `NOT_FOUND` |
| `dependency.list` | GET | `/tickets/{key}/dependencies` | read | `NOT_FOUND` |
| `sprint.create` | POST | `/sprints` | manage | `FORBIDDEN`, `VALIDATION`, `CONFLICT` |
| `sprint.get` | GET | `/sprints/{key}` | read | `NOT_FOUND` |
| `sprint.list` | GET | `/sprints` | read | none |
| `sprint.update` | PATCH | `/sprints/{key}` | manage | `FORBIDDEN`, `NOT_FOUND`, `VALIDATION` |
| `sprint.activate` | POST | `/sprints/{key}/activate` | manage | `FORBIDDEN`, `NOT_FOUND`, `CONFLICT` |
| `sprint.close` | POST | `/sprints/{key}/close` | manage | `FORBIDDEN`, `NOT_FOUND`, `CONFLICT` |
| `comment.create` | POST | `/comments` | owner, admin, dev, designer, client; agents by token | `FORBIDDEN` |
| `comment.list` | GET | `/comments` | read | none |
| `comment.delete` | DELETE | `/comments/{id}` | author, owner, admin | `FORBIDDEN`, `NOT_FOUND` |
| `projectState.get` | GET | `/project-state` | owner, admin, dev (enforced since TK-31) | none (the `FORBIDDEN` 403 is not typed in the contract) |
| `projectState.update` | PUT | `/project-state` | owner, admin | `FORBIDDEN`, `VERSION_CONFLICT` |
| `lease.acquire` | POST | `/tickets/{key}/lease` | owner, admin, dev | `FORBIDDEN`, `NOT_FOUND`, `LEASE_HELD` |
| `lease.heartbeat` | POST | `/tickets/{key}/lease/heartbeat` | manage, then holder only | `NOT_FOUND`, `LEASE_NOT_HOLDER`, `LEASE_EXPIRED` |
| `lease.release` | DELETE | `/tickets/{key}/lease` | manage, then holder only (no force mechanism in the contract) | `NOT_FOUND`, `LEASE_NOT_HOLDER` |
| `lease.get` | GET | `/tickets/{key}/lease` | read | `NOT_FOUND` |
| `audit.list` | GET | `/audit` | owner, admin | `FORBIDDEN` |

`audit` is read-only: the log is immutable (CDC §4.2) and fed by the server. There is no
`lock.*` group: the **merge and spec-write locks are not delivered on the API side** (no `locks`
table, no procedure in contract 0.4.0). Delivering them needs a database migration and a
contract 0.5.0; a follow-up ticket is to be created.

## Tickets, dependencies and sprints (TK-30)
Modules `ticket/`, `sprint/` and `tracker/` (shared bricks) in `apps/api`, a NestJS adapter on top
of `@koklo/domain` (a runtime dependency since TK-30): the domain decides (lifecycle table H1,
dependency graph, validation), the API orchestrates and persists. The contract is unchanged (0.4.0).

Each use case runs in **one Prisma transaction** under `withOrganization`
(`tracker/project-transactions.ts`): the project is checked to belong to the organization
(`NOT_FOUND` otherwise), then read, write, key counter (`TK-n`, `SP-n`, `tracker/counters.ts`)
and `audit_log` row (`tracker/audit.ts`) commit or roll back together.

| Procedure | Behaviour |
|-----------|-----------|
| `ticket.create` | Domain validation; `pkg:*` labels rejected (`VALIDATION`, field `labels`, rule `assertNoPackageLabel` of `@koklo/domain`); `sprintId` must be a planned or active sprint of the project; key from the counter; criteria stored with 1-based positions |
| `ticket.get` | Detail with criteria, dependencies and active lease; `lease.worktree` is `""` unless the caller's role is in `TICKET_WRITE_ROLES` (owner, admin, dev, designer; deny by default, also without role) |
| `ticket.list` | Filters `status`, `sprintId`, `pkg`, `assignee` (`kind:id` or bare id); order `(createdAt, id)`; cursor pagination; **an invalid cursor is ignored** (first page) because the contract declares no `VALIDATION` error on this route |
| `ticket.update` | Merged state validated by the domain, then only the provided fields are written; a provided `labels` or `linkedFeatures` list replaces the stored one |
| `ticket.delete` | Soft delete; `CONFLICT ticket_has_active_lease` while a lease is held |
| `ticket.transition` | Table H1, then CDC §7.2 for `todo -> in_progress`: every `blocks` dependency must be `done`, otherwise `INVALID_TRANSITION { from, to }` |
| `dependency.add` / `remove` / `list` | Cycle detection on the project graph (`DEPENDENCY_CYCLE`); re-adding an identical edge is an idempotent no-op (no write, no audit); removing an absent edge is `NOT_FOUND` |
| `sprint.create` / `update` | `endsOn >= startsOn` (`VALIDATION`, also when only one date changes); `SP-n` from the counter |
| `sprint.activate` / `close` | `planned -> active -> closed`, no reopening. One active sprint per project: pre-check plus the partial unique index; a concurrent loser (`P2002`) becomes `CONFLICT sprint_already_active` |

### Current project (v1)
Neither the session nor the contract carries a project, so `PROJECT_CONTEXT`
(`project/project-context.ts`) resolves it: `OldestProjectContext` returns the oldest project of
the session organization (`createdAt`, then `id`); an organization without project gives
`NOT_FOUND`. The value never comes from the client. An explicit project selection will replace
this class without touching the services. Every read and write is filtered by this `projectId`.

### Permission matrix (TK-30)
Single source of the write roles: `TICKET_WRITE_ROLES` in `apps/api/src/auth/roles.ts` (owner,
admin, dev, designer), checked by `apps/api/test/ticket-roles-consistency.test.ts`. The role is
re-read from `members` on every request (`RoleGuard`).

| Procedure | owner | admin | dev | designer | client | business |
|-----------|:-----:|:-----:|:---:|:--------:|:------:|:--------:|
| `ticket.get`, `ticket.list`, `dependency.list`, `sprint.get`, `sprint.list` | yes | yes | yes | yes | yes | yes |
| `ticket.create`, `update`, `delete`, `transition` | yes | yes | yes | yes | no | no |
| `dependency.add`, `dependency.remove` | yes | yes | yes | yes | no | no |
| `sprint.create`, `update`, `activate`, `close` | yes | yes | yes | yes | no | no |

401 without session or active organization, 403 for a role marked "no".

### Known limits and debt (TK-30)
- **No composite foreign key from child rows to the ticket (TK-28 debt).** `ticket_labels`,
  `ticket_features`, `acceptance_criteria` and `ticket_dependencies` reference the ticket by id
  only, so the database does not forbid a child row pointing to a ticket of another project or
  organization. This is covered by the application safety net only: every child write goes
  through `assertOwned` (ticket in the organization AND the current project), every read filters
  by `projectId`, and child rows are written through model operations (not nested writes) so the
  tenant extension applies. To harden later with composite keys `(id, project_id)`; a follow-up
  ticket should track it.
- The `pkg:*` label rule is domain logic (`assertNoPackageLabel` in
  `packages/domain/src/ticket-package.ts`), raised as `InvalidTicketError` and mapped to
  `VALIDATION`.
- `ticket.delete` is allowed to every manager role, while the contract intent says owner and
  admin only; to be arbitrated by the product owner.

## Inputs, outputs and error shapes

Schemas are in `packages/contract/src/schemas.ts`:

| Operation | Input | Output |
|-----------|-------|--------|
| `health` | `{}` | `{ status: "ok", version: string }` |
| `organization.create` | `{ name: 1..100, slug?: 2..48, [a-z0-9-] }` | `{ id: uuid, name, slug }` |
| `organization.list` | none | array of `{ id, name, slug, role }` (caller's own role) |
| `member.invite` | `{ email, role: MemberRole }` | `{ id, email, role, status: "pending", expiresAt: ISO datetime }` |
| `member.list` | none | array of `{ id, userId, name, email, role }` |
| `member.setRole` | `{ memberId: uuid, role: MemberRole }` (`memberId` in the path) | `{ id, role: MemberRole }` |
| `project.list` | none | array of `{ id, name }` |
| `project.create` | `{ name: 1..100 }` | `{ id, name }` |

TK-29 schemas live in `src/schemas-tickets.ts` (tickets, dependencies, sprints) and
`src/schemas-collaboration.ts` (comments, project state, leases, audit), re-exported by
`src/schemas.ts`. Enum values are the literals of `@koklo/domain`; the contract cannot
depend on the domain (`turbo boundaries`), so the parity is tested in
`apps/api/test/contract-domain-parity.test.ts`.

| Schema | Shape |
|--------|-------|
| `ticketKeySchema`, `sprintKeySchema` | `TK-n`, `SP-n` (`n >= 1`, no leading zero): public identifiers in paths |
| `instantSchema` | ISO-8601 UTC datetime; sprint dates are `YYYY-MM-DD` |
| `ticketSchema` | domain `Ticket` + `id` (uuid): `key, title, description, type, status, priority, sprint (SP-n or null), assignee (string or null), pkg (one of 15), labels, sensitivity, estimateHours (>= 0 or null), linkedFeatures, branch, pullRequest, attempts, reviewRounds, createdAt` |
| `ticketDetailSchema` | `ticketSchema` + `criteria [{ statement, specRef or null }]`, `dependencies`, `lease` (active or null) |
| `ticket.create` input | `title 1..200, type, priority, pkg, sensitivity` required; `description, status (backlog or todo), sprintId, assignee {kind member or runner, id}, labels, estimateHours, linkedFeatures, criteria` optional |
| `ticket.update` input | `key` + any editable field; **strict**: `status` is rejected (use `ticket.transition`) |
| `dependency.add` input | `{ key, dependsOn, type: blocks or related }`; `dependsOn === key` rejected |
| `sprintSchema` | `{ id, key, goal, status: planned, active or closed, startsOn, endsOn, definitionOfDone }`; `endsOn >= startsOn` (create, and update when both given); update is strict (no `status`) |
| `commentSchema` | `{ id, targetKind: ticket, feature, screen or change_request, targetId, authorKind: human, agent, client or system, authorId, body, createdAt }`; body 1..8000 on create; the author is never read from the input |
| `projectStateSchema` | `{ version >= 1, content: object }`; `projectState.update` takes `{ expectedVersion >= 1, content }` (full replacement) |
| `leaseSchema` | domain `Lease`: `ticket, holder {kind member or runner, id}, branch, worktree, acquiredAt, heartbeatAt, expiresAt, ttlMs > 0, released`; `lease.acquire` takes `{ key, branch, worktree, ttlMs? }`, the holder comes from the token; `lease.get` returns a lease or `null` |
| `auditEntrySchema` | `{ id, actorKind: human, agent, runner or system, actorId?, tokenId?, action, targetKind, targetId, ticketKey?, occurredAt }` |

Pagination (`ticket.list`, `comment.list`, `audit.list`): cursor-based, input `limit`
(1..100, coerced from the query string) and `cursor`, output `{ items, nextCursor: string or null }`.
`sprint.list` and `dependency.list` are not paginated (bounded volume).

Roles (CDC §14): `Role` = `owner | admin | dev | designer | client | business`;
`MemberRole` = `Role` without `owner`. `owner` can never be granted by invitation or role
change. TypeScript types are exported from the package index (`Role`, `MemberRole`,
`OrganizationCreateInput`, `MemberInviteInput`, `ProjectCreateInput` and the outputs).
Pagination and filtering: none defined (ASSUMPTION: to be added by a later ticket).

Typed errors are declared in the contract (`src/errors.ts`); each route exposes only the
ones it lists:

| Code | HTTP status | Data | Meaning |
|------|-------------|------|---------|
| `INTERNAL` | 500 | `{ requestId: string }` | every route |
| `UNAUTHORIZED` | 401 | none | no or expired session |
| `FORBIDDEN` | 403 | none | role not allowed for the action (see below) |
| `NOT_FOUND` | 404 | none | `member.setRole`: member absent from the active organization; TK-29 routes: ticket, sprint, comment, dependency or lease unknown or in another project |
| `CONFLICT` | 409 | `{ reason }` | state conflict |
| `INVALID_TRANSITION` | 409 | `{ from, to }` | `ticket.transition`: refused by the lifecycle table (`InvalidTicketTransitionError`) |
| `DEPENDENCY_CYCLE` | 409 | `{ path: TK-n[] }` | `dependency.add` (`DependencyCycleError`) |
| `VERSION_CONFLICT` | 409 | `{ expected, current: { version, content } }` | `projectState.update`: refused with the current state (`StaleProjectStateError`) |
| `LEASE_HELD` | 409 | `{ ticket, holder, expiresAt }` | `lease.acquire` (`LeaseAlreadyHeldError`) |
| `LEASE_EXPIRED` | 409 | `{ ticket, expiresAt }` | `lease.heartbeat` (`LeaseExpiredError`) |
| `LEASE_NOT_HOLDER` | 403 | `{ ticket, holder }` | `lease.heartbeat`, `lease.release`; `holder` is the actual holder (`LeaseNotHeldByError`) |
| `VALIDATION` | 422 | `{ field, message }` | `ticket.create/update`, `sprint.create/update`: semantically invalid input (`InvalidTicketError`, `TicketPackageError`, `InvalidSensitivityError`) |

`CONFLICT.data.reason` is one of: `slug_taken` (`organization.create`), `already_member`
and `already_invited` (`member.invite`), `last_owner` (`member.setRole`: would leave the
organization without owner), and since 0.4.0 `sprint_already_active`, `sprint_not_planned`,
`sprint_not_active` (`sprint.activate`/`close`, and `sprint.create`), `ticket_has_active_lease`
(`ticket.delete`) and `counter_limit_reached` (`ticket.create`, `ticket.transition`); the
extension is backward compatible (values added). In the generated OpenAPI, the `INTERNAL`
payload is the component schema `Internal`; the new payloads are `InvalidTransition`,
`DependencyCycle`, `VersionConflict`, `LeaseHeld`, `LeaseExpired`, `LeaseNotHolder` and
`Validation`.

Decisions taken in TK-29 (to confirm at implementation, TK-30 to TK-32): `ticket.transition`
does not expose `LEASE_NOT_HOLDER` (the contract does not force a lease for a transition);
the audit log is readable by owner and admin only (loosening it is not a breaking change).

Roles allowed per action (to enforce in TK-23): `member.invite` and `member.setRole` are
reserved to `owner`/`admin` (otherwise `FORBIDDEN`); `project.create` to the roles the CDC
allows to create projects (otherwise `FORBIDDEN`).

## Leases and project state (TK-31)
Modules `lease/` and `project-state/` in `apps/api`, same hexagonal shape as TK-30 (controller,
service, repository port, Prisma adapter, one `ProjectTransactions` transaction and one
`audit_log` row per write). The contract is unchanged (0.4.0). The domain decides (holder,
expiry, version rule: `acquireLease`, `heartbeat`, `release`, `writeProjectState`); domain errors
become typed errors through `tracker/api-errors.ts`.

**Injected clock.** `CLOCK` (`clock.ts`, global `ClockModule`) is the only source of time for a
decision: lease expiry, "active lease" filters of `ticket.get`/`ticket.delete`. Neither
`Date.now()` nor SQL `now()` decides anywhere; tests replace it with `overrideProvider(CLOCK)`.

| Constant (`auth/roles.ts`) | Roles | Used by |
|----------------------------|-------|---------|
| `LEASE_ACQUIRE_ROLES` | owner, admin, dev | `lease.acquire` |
| `TICKET_WRITE_ROLES` | owner, admin, dev, designer | `lease.heartbeat`, `lease.release` (then the holder only, else `LEASE_NOT_HOLDER`) |
| `PROJECT_STATE_READ_ROLES` | owner, admin, dev | `projectState.get` |
| `PROJECT_STATE_WRITE_ROLES` | owner, admin | `projectState.update` |

`lease.get` is open to every role; `canSeeWorktree(role)` (true for `TICKET_WRITE_ROLES`) masks
`worktree` as `""` for the others, in `lease.get` and `ticket.get` alike. A role outside
`PROJECT_STATE_READ_ROLES` gets a 403 on `projectState.get` that is **not typed** in the contract
(the route declares no `FORBIDDEN`); the client sees a generic forbidden response.

| Procedure | Behaviour |
|-----------|-----------|
| `lease.acquire` | Expired leases of the ticket are marked released in the same transaction, then the domain checks, then INSERT. A race lost on the partial unique index (`P2002`) rolls back and a second transaction reads the winner: `LEASE_HELD` |
| `lease.heartbeat` | Domain extends the lease; persisted by a conditional UPDATE (not released, not expired). No active lease: `LEASE_EXPIRED` if the ticket ever had one, else `NOT_FOUND` |
| `lease.release` | Holder only (`LEASE_NOT_HOLDER`); conditional UPDATE. **No one can force a release**: the contract has no such mechanism, so owner and admin are not exempt |
| `lease.get` | Active lease or `null` |
| `projectState.get` | Row created on demand (`{ version: 1, content: {} }`) with `createMany skipDuplicates` (no `P2002`) |
| `projectState.update` | Domain version rule, then `UPDATE ... WHERE version = expected`; zero rows means a concurrent write won: re-read and `VERSION_CONFLICT` |

## Implementation of the six procedures (TK-23)
| Procedure | Controller guards | Behaviour |
|-----------|-------------------|-----------|
| `organization.create` | `UserSessionGuard` | Slug checked (`slug_taken`) or derived from the name with a numeric suffix; creation through Better Auth `createOrganization` (caller becomes `owner`, organization becomes active on the session) |
| `organization.list` | `UserSessionGuard` | Organizations the caller belongs to, with the caller's role |
| `member.list` | `SessionGuard` | Members of the session organization |
| `member.invite` | `SessionGuard`, `RoleGuard` | `already_member` / `already_invited` checks, then Better Auth `createInvitation`; its callback enqueues the email job |
| `member.setRole` | `SessionGuard`, `RoleGuard` | Serializable transaction: `NOT_FOUND`, H3, `last_owner` |
| `project.create` | `SessionGuard`, `RoleGuard` | Project created under the session organization |

`NOT_FOUND` is identical for an unknown member and a member of another organization.
Every organization value comes from the session, never from the input. The role check runs
before input validation (403 before 400).

### Permission matrix (CDC §14)
`RoleGuard` reads the role from `members` on every request. Single source of the manager
roles: `MANAGER_ROLES` in `apps/api/src/auth/roles.ts`, used by the `@Roles` decorators; the
Better Auth access-control table in the same file is its echo, and
`apps/api/test/roles-consistency.test.ts` fails if the two, or the contract's `roleSchema`,
drift apart.

| Procedure | owner | admin | dev | designer | client | business |
|-----------|:-----:|:-----:|:---:|:--------:|:------:|:--------:|
| `organization.create`, `organization.list` | yes | yes | yes | yes | yes | yes |
| `member.list` | yes | yes | yes | yes | yes | yes |
| `member.invite` | yes | yes | no | no | no | no |
| `member.setRole` | yes | yes | no | no | no | no |
| `project.create` | yes | yes | no | no | no | no |

`organization.*` needs a session only (any user; no role). Others: 401 without session or
active organization, 403 for a role marked "no".

### Web consumer (TK-24)
`apps/web` calls these procedures; the contract is unchanged. Roles are shown from `organization.list`
(`role` of the active organization); the UI hides what the matrix forbids, the API stays the authority.

| Screen | Procedure | Error handling in the UI |
|--------|-----------|--------------------------|
| `/organizations` | `organization.list`, `organization.create` | `CONFLICT slug_taken` shown under "Identifiant"; other errors in an alert; `UNAUTHORIZED` re-checks the session (no session: `/login`; session: `/organizations`) |
| `/members` | `member.list`, `member.invite` | `CONFLICT already_member` / `already_invited` under "Adresse e-mail"; `FORBIDDEN` as a message; other errors in an alert |
| `/projects` | `project.list`, `project.create` | `FORBIDDEN` as a message; other errors in an alert |

Organization activation is not an oRPC procedure: the web calls the Better Auth client
`organization.setActive` (`/api/auth/*`). `member.setRole` has no screen yet.

### Hypotheses to validate (product owner)
- **H1 (to validate)**: `project.create` is owner and admin only. The CDC has no "create a
  project" row; the cautious option was kept (TK-21 had assumed dev as well). Opening it to
  `dev` later is backward compatible, the reverse is not.
- **H2 (to validate)**: any member can list members.
- **H3 (to validate)**: only an `owner` changes the role of an `owner` or grants `admin`
  (invitation included); otherwise 403. `owner` is never assignable.

### Out of scope
The invitation acceptance page and the `acceptInvitation` call (web, follow-up ticket): TK-23
creates the invitation and enqueues the email, whose link is `<BETTER_AUTH_URL>/accept-invitation/<id>`.
Ownership transfer and member removal are not in the contract.

As of TK-86 the page exists: `apps/web/src/app/accept-invitation/[id]` calls the Better Auth client
`organization.getInvitation` (preview, recipient only) then `organization.acceptInvitation` (explicit click).
No oRPC procedure was added; without a session the proxy redirects to `/login?next=/accept-invitation/<id>`.

### Known limits
- Invitation acceptance (TK-86): Better Auth returns a single `INVITATION_NOT_FOUND` (400) for an
  unknown, expired, canceled or already accepted invitation, so the web shows one message naming the
  possible causes. For a user who is **already a member**, `acceptInvitation` answers **500** with no
  body (API log: Prisma `P2002` on `members_organization_id_user_id_key`); the invitation stays
  `pending` and the existing member is untouched (no duplicate). The web avoids the call by checking
  `organization.list` first (and again after a 5xx) and shows "Vous faites déjà partie de cette
  organisation". Another client calling the endpoint directly still gets the 500 (logged as ERROR).
- No pending-invitation list and no resend or cancel procedure: the web cannot show `already_invited`
  before the error, nor resend an email (TK-24 observation; see also the limits below).
- Better Auth swallows errors of `sendInvitationEmail`: if pg-boss fails, the invitation
  exists without an email and the response is still 200. The failure is logged
  (`enqueue failed`, queue and error name only) and sent to Sentry; there is no resend
  procedure yet.
- A concurrent `setRole` race on the last owner can abort the Serializable transaction and
  return `INTERNAL` (500) instead of `CONFLICT last_owner`. The organization is never left
  without an owner.

## Authentication and authorization
`project.list` requires a session (TK-11, [ADR 0003](adr/0003-better-auth-session-guard.md)).
`apps/api` mounts Better Auth on `/api/auth/*` (GitHub OAuth sign-in and callback, sign-out);
these routes belong to Better Auth, not to the oRPC contract. The session is a signed Better
Auth cookie.

Three guards (TK-23, [architecture.md](architecture.md#organizations-members-and-roles-tk-23)): `UserSessionGuard` (session only), `SessionGuard` (active organization) and `RoleGuard` (`@Roles`). A per-procedure Nest guard (`SessionGuard`, `@UseGuards` on `ProjectController.list`; not
global) resolves the session before the service runs. The request is refused with the typed
`UNAUTHORIZED` error (401, body `{ code, status, message, ... }`) when:

- there is no cookie, or it is unknown, forged or expired;
- the session has no active organization;
- the user is not a member of the active organization (checked in the `member` table).

The organization used for the query comes only from the resolved session
(`SessionOrganizationContext`); an organization sent by the client (header, query, body) is
ignored. `FORBIDDEN` is emitted by `RoleGuard` (TK-23). The repository port has no "list
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
Error statuses are derived from the contract's own error maps (the router tree is walked,
no list of procedures to maintain), not written twice.

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

## Comments and audit log (TK-32)
Modules `comment/` and `audit/` in `apps/api`, same hexagonal shape as TK-31. The contract is
unchanged (0.4.0). `comment.create` and `comment.delete` write their `audit_log` row
(`comment.create`, `comment.delete`, target kind `comment`, `ticket_id` = the commented ticket)
in the same transaction as the write. Roles live in `auth/roles.ts`: `COMMENT_WRITE_ROLES`
(owner, admin, dev, designer, client), `COMMENT_DELETE_ANY_ROLES` (owner, admin),
`AUDIT_READ_ROLES` (owner, admin).

| Route | Rule |
|---|---|
| `comment.create` | owner, admin, dev, designer, client (business is read-only: `FORBIDDEN`). The author comes from the session, never from the input: `client` writes as `authorKind: client`, the others as `human`, `authorId` is the user id. Body 1..8000 characters, stored as is (untrusted data). A body refused by the contract schema is returned as `VALIDATION` (422), see "Schema refusals" below |
| `comment.list` | every role. Oldest first, cursor on `(createdAt, id)`; deleted comments are hidden. A row with a NULL `author_id` (system comment) is served with `authorId: "system"` |
| `comment.delete` | the author, or owner and admin for any comment. Soft delete (`deleted_at` set from `CLOCK`); the row stays. Membership of the project is checked before the right: unknown, already deleted or foreign comment is `NOT_FOUND`, another author's comment is `FORBIDDEN` |
| `audit.list` | owner and admin only. Newest first, cursor on `(occurredAt, id)`. Filters combined with AND: `ticketKey` (unknown key: empty page), `actorKind`, `action` (exact), `from` (included), `to` (excluded). Null fields are omitted, `ticketKey` is resolved even for a soft-deleted ticket, the comment body is never exposed |

Target validation (done by the API, the contract types `targetId` as a free string): only
`targetKind: ticket` is accepted (`VALIDATION{targetKind}` otherwise: features, screens and change
requests have no table); `targetId` must be a UUID (`VALIDATION{targetId}`); the ticket must exist,
not be deleted and belong to the current project (`NOT_FOUND`). Pagination: `limit` default 50,
maximum 100, a malformed cursor is `VALIDATION{cursor}`. These `VALIDATION`, `NOT_FOUND` and
`FORBIDDEN` errors are raised with the right HTTP status but are not typed in the 0.4.0 OpenAPI
(candidates for 0.5.0, with a nullable `authorId`, a `uuid` `targetId` and an enumerated audit
`targetKind`).

**Schema refusals (temporary interceptor).** The contract types `comment.create` without
`VALIDATION`, so the framework rejects an empty or over-long body as `BAD_REQUEST` (400). The
tests require 422, so `input-validation.ts` (an oRPC client interceptor registered in
`ORPCModule.forRoot`) converts it. Its scope is exactly the route `POST /comments`, read from the
procedure's OpenAPI metadata; it converts only a `BAD_REQUEST` that carries schema `issues`
(field = first path segment, message = first issue) and passes every other error through
unchanged, so it hides nothing (organisation routes keep their 400). It is a stopgap: contract 0.5.0
must type `VALIDATION` on `comment.create`, after which the interceptor is deleted.

**Shared bricks added by TK-32** (`tracker/`): `cursor.ts` (opaque base64url cursor on
`(sort key, id)`, `keysetAfter`, `pageOfItems`, default page size 50) now serves `ticket.list`,
`comment.list` and `audit.list`; `uuid.ts` (`isUuid`). A malformed cursor is `VALIDATION{cursor}` on
comments and audit, but still ignored on `ticket.list` (no typed error on that route).

**Hypotheses for contract 0.5.0** (decisions to take, none applied in 0.4.0):
- `VALIDATION` and `NOT_FOUND` typed on `comment.*`; `FORBIDDEN` typed on `comment.list` and
  `audit.list`; `FORBIDDEN` on `projectState.get`.
- `authorId` nullable (or the fixed value `"system"` documented) instead of `min(1)`; `targetId`
  as `z.uuid()`; audit `targetKind` enumerated; explicit `projectId` instead of the oldest project.
- Open question: may the `client` role see comments written by agents? (Settled: `organization.create`,
  `member.invite`, `member.setRole` and `project.create` are journaled, see "Audit of organisation,
  member and project writes".)
- Only the `ticket` target is accepted for comments (no table for features, screens, change requests).

**Immutable log.** The only writer is `recordAudit` (`tracker/audit.ts`); the `audit` module only
calls `findMany`/`findFirst`, `/audit` has only `GET`, and the database triggers refuse `UPDATE`,
`DELETE` and `TRUNCATE`. A test derives every non-GET procedure of every group from the contract
(20 writes, no group excluded) and checks each one writes exactly one audit row.

**Audit of organisation, member and project writes (decision Q2: journaled).** `recordAudit` takes
an `AuditActor` (`{ organizationId, userId }`); a `ProjectScope` is one, and writes outside a
project pass the session's organisation and user. Actor is always `human` (session user), `ticket_id`
is NULL, `target_kind` is free text in the database (the TypeScript union gained `organization`,
`invitation`, `member`, `project`). No entry on refusal (403, 409).

| Procedure | action | targetKind / targetId | Entry's organisation | Atomicity |
|---|---|---|---|---|
| `project.create` | `project.create` | `project` / project id | session | same transaction as the insert |
| `member.setRole` | `member.setRole` | `member` / member id | session | same (Serializable) transaction as the update |
| `organization.create` | `organization.create` | `organization` / new organisation id | the NEW organisation | same transaction as the organisation and its `owner` member |
| `member.invite` | `member.invite` | `invitation` / invitation id | session | NOT atomic, see below |

`organization.create` no longer goes through Better Auth's `createOrganization`, which writes the
organisation and the member in separate, non-transactional statements and cannot join a caller's
transaction. The service inserts the organisation, the `owner` member (the plugin's `creatorRole`)
and the audit row in one Prisma transaction, then calls `auth.api.setActiveOrganization` to put the
organisation on the session. Slug conflicts still return `CONFLICT{slug_taken}` (pre-check, plus
re-check after a unique violation). Residual risk: if `setActiveOrganization` fails after the commit,
the organisation exists, is audited, and the call returns an error; the user is not locked out
(`organization.list` shows it, the session can select it) and retrying with the same name yields a
new suffixed slug. Better Auth hooks on the organisation model are bypassed (none configured).

`member.invite` stays on Better Auth's `createInvitation` (it also cancels earlier pending invitations
and hands the e-mail job to the worker through `sendInvitationEmail`; reimplementing that would
duplicate the plugin). Better Auth writes with its own client, so the audit cannot share its
transaction: `recordInvitation` writes the entry right after the invitation succeeds, before the
response. Compromise: if that insert fails (database outage between the two statements), the
invitation exists, its e-mail is queued, no audit row exists and the caller gets a 500. The window
is one statement; the failure is visible (500 and the request log), not silent. Reaching strict
atomicity would require owning the invitation write (a Prisma insert plus the queue) or a Better Auth
adapter transaction hook; neither is available in better-auth 1.7.14 for this endpoint.

## Sprint import (TK-34)
No new route and no contract change: the import is an administration command (`import:sprints`,
see [Quality and operations](quality-and-operations.md#sprint-import-command-importsprints-tk-34)),
absent from the OpenAPI document. It writes through the same ports, transactions and audit rows as
`ticket.*` and `sprint.*`, with three extra audit actions: `sprint.import`, `ticket.import` and
`dependency.import`. Imported tickets keep their `TK-n` keys, so the next `ticket.create` continues
after the highest imported number. The actor must be `owner` or `admin`, like the manager routes.

## Version history
- **0.4.0** (TK-29, 15 routes implemented in TK-30, 6 more in TK-31: leases and project state): tickets, dependencies, sprints, comments, project state, leases and
  read-only audit (25 routes, all implemented since TK-32); typed errors `INVALID_TRANSITION`,
  `DEPENDENCY_CYCLE`, `VERSION_CONFLICT`, `LEASE_HELD`, `LEASE_EXPIRED`,
  `LEASE_NOT_HOLDER`, `VALIDATION`; `CONFLICT.reason` extended. Backward compatible
  (pre-1.0 addition); the frozen fingerprint of 0.3.0 is unchanged.
- 0.3.0 (TK-21): organisations, members, projects.
