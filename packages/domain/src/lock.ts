import { LockAlreadyHeldError, LockNotHeldByError, NestedLockError } from "./errors.ts";
import { formatInstant, parseInstant } from "./instant.ts";
import { freezeHolder, type Holder, sameHolder } from "./lease.ts";

export type LockKind = "merge" | "spec-write";

export interface Lock {
  readonly kind: LockKind;
  readonly scope: string;
  readonly holder: Holder;
  readonly acquiredAt: string;
  readonly expiresAt: string;
}

export interface LockRequest {
  readonly kind: LockKind;
  readonly scope: string;
  readonly holder: Holder;
  readonly ttlMs: number;
}

export const isLockActive = (lock: Lock, now: string): boolean =>
  parseInstant(now) < parseInstant(lock.expiresAt);

const sameTarget = (lock: Lock, kind: string, scope: string): boolean =>
  lock.kind === kind && lock.scope === scope;

/** Un porteur ne tient jamais deux verrous à la fois ; ordre des refus : conflit, puis imbrication. */
export const acquireLock = (
  held: readonly Lock[],
  request: LockRequest,
  now: string,
): { readonly lock: Lock; readonly locks: readonly Lock[] } => {
  const nowMs = parseInstant(now);
  const holder = freezeHolder(request.holder);
  const active = held.filter((l) => isLockActive(l, now));
  const owned = active.find((l) => sameHolder(l.holder, holder));
  const conflict = active.find((l) => sameTarget(l, request.kind, request.scope));
  if (conflict && !owned) throw new LockAlreadyHeldError(conflict);
  if (owned) {
    throw new NestedLockError(holder, owned, { kind: request.kind, scope: request.scope });
  }
  const lock: Lock = Object.freeze({
    kind: request.kind,
    scope: request.scope,
    holder,
    acquiredAt: now,
    expiresAt: formatInstant(nowMs + request.ttlMs),
  });
  return Object.freeze({ lock, locks: Object.freeze([...held, lock]) });
};

export const releaseLock = (
  held: readonly Lock[],
  target: { readonly kind: LockKind; readonly scope: string },
  holder: Holder,
): readonly Lock[] => {
  const found = held.find(
    (l) => sameTarget(l, target.kind, target.scope) && sameHolder(l.holder, holder),
  );
  if (!found) throw new LockNotHeldByError(target.kind, target.scope, holder);
  return Object.freeze(held.filter((l) => l !== found));
};
