import {
  InvalidLeaseError,
  LeaseAlreadyHeldError,
  LeaseExpiredError,
  type LeaseHolderRef,
  LeaseNotHeldByError,
} from "./errors.ts";
import { formatInstant, parseInstant } from "./instant.ts";
import { parseTicketKey } from "./ticket-key.ts";

export const DEFAULT_LEASE_TTL_MS = 900_000;

export type Holder = LeaseHolderRef;

export interface Lease {
  readonly ticket: string;
  readonly holder: Holder;
  readonly branch: string;
  readonly worktree: string;
  readonly acquiredAt: string;
  readonly heartbeatAt: string;
  readonly expiresAt: string;
  readonly ttlMs: number;
  readonly released: boolean;
}

export interface LeaseRequest {
  readonly ticket: string;
  readonly holder: Holder;
  readonly branch: string;
  readonly worktree: string;
  readonly ttlMs?: number;
}

const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "";

export const freezeHolder = (holder: Holder, field = "holder"): Holder => {
  const valid =
    holder !== null &&
    typeof holder === "object" &&
    (holder.kind === "member" || holder.kind === "runner") &&
    nonEmpty(holder.id);
  if (!valid) throw new InvalidLeaseError(field, "titulaire invalide (kind et id requis)");
  return Object.freeze({ kind: holder.kind, id: holder.id });
};

export const sameHolder = (a: Holder, b: Holder): boolean => a.kind === b.kind && a.id === b.id;

const validTtl = (ttlMs: unknown): number => {
  if (typeof ttlMs !== "number" || !Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
    throw new InvalidLeaseError("ttl", "durée entière strictement positive attendue");
  }
  return ttlMs;
};

export const isActive = (lease: Lease, now: string): boolean =>
  !lease.released && parseInstant(now) < parseInstant(lease.expiresAt);

export const activeLeaseFor = (
  leases: readonly Lease[],
  ticket: string,
  now: string,
): Lease | null => leases.find((l) => l.ticket === ticket && isActive(l, now)) ?? null;

export const acquireLease = (
  leases: readonly Lease[],
  request: LeaseRequest,
  now: string,
): { readonly lease: Lease; readonly leases: readonly Lease[] } => {
  const nowMs = parseInstant(now);
  parseTicketKey(request.ticket);
  const holder = freezeHolder(request.holder);
  if (!nonEmpty(request.branch)) throw new InvalidLeaseError("branch", "branche requise");
  if (!nonEmpty(request.worktree)) throw new InvalidLeaseError("worktree", "worktree requis");
  const ttlMs = validTtl(request.ttlMs ?? DEFAULT_LEASE_TTL_MS);
  const active = activeLeaseFor(leases, request.ticket, now);
  if (active) throw new LeaseAlreadyHeldError(active);
  const lease: Lease = Object.freeze({
    ticket: request.ticket,
    holder,
    branch: request.branch,
    worktree: request.worktree,
    acquiredAt: now,
    heartbeatAt: now,
    expiresAt: formatInstant(nowMs + ttlMs),
    ttlMs,
    released: false,
  });
  return Object.freeze({ lease, leases: Object.freeze([...leases, lease]) });
};

export const heartbeat = (lease: Lease, holder: Holder, now: string): Lease => {
  const nowMs = parseInstant(now);
  if (!sameHolder(lease.holder, holder)) throw new LeaseNotHeldByError(lease, holder);
  if (!isActive(lease, now)) throw new LeaseExpiredError(lease);
  return Object.freeze({
    ...lease,
    heartbeatAt: now,
    expiresAt: formatInstant(nowMs + lease.ttlMs),
  });
};

export const release = (lease: Lease, holder: Holder): Lease => {
  if (!sameHolder(lease.holder, holder)) throw new LeaseNotHeldByError(lease, holder);
  return Object.freeze({ ...lease, released: true });
};

export const releaseExpired = (
  leases: readonly Lease[],
  now: string,
): { readonly active: readonly Lease[]; readonly expired: readonly Lease[] } => {
  const active: Lease[] = [];
  const expired: Lease[] = [];
  for (const l of leases) (isActive(l, now) ? active : expired).push(l);
  return Object.freeze({ active: Object.freeze(active), expired: Object.freeze(expired) });
};
