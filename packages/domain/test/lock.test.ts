import { describe, expect, it } from "vitest";
import {
  acquireLock,
  isLockActive,
  type Lock,
  LockAlreadyHeldError,
  LockNotHeldByError,
  NestedLockError,
  releaseLock,
} from "../src/index.ts";
import { at, runner, T0, throwsA } from "./clock-helpers.ts";

const W = runner("W");
const V = runner("V");
const merge = (holder = W, scope = "P") =>
  ({ kind: "merge", scope, holder, ttlMs: 600_000 }) as const;
const spec = (holder = W, scope = "feat/x") =>
  ({ kind: "spec-write", scope, holder, ttlMs: 600_000 }) as const;

describe("incident-04-nested-locks-refused", () => {
  it("incident-04-nested-locks-refused", () => {
    const { locks, lock } = acquireLock([], merge(), T0);
    const snapshot = JSON.stringify(locks);
    try {
      acquireLock(locks, spec(), at(1));
      expect.unreachable("NestedLockError attendue");
    } catch (error) {
      expect(error).toBeInstanceOf(NestedLockError);
      const nested = error as NestedLockError;
      expect(nested.holder).toEqual(W);
      expect(nested.held).toEqual(lock);
      expect(nested.requested).toMatchObject({ kind: "spec-write", scope: "feat/x" });
    }
    expect(JSON.stringify(locks)).toBe(snapshot);
  });
});

describe("CA3 verrous", () => {
  it("le verrou pris porte son expiration (now + ttl)", () => {
    const { lock } = acquireLock([], merge(), T0);
    expect(lock).toMatchObject({
      kind: "merge",
      scope: "P",
      holder: W,
      acquiredAt: T0,
      expiresAt: at(10),
    });
    expect(Object.isFrozen(lock)).toBe(true);
  });

  it("V2 : l'inverse (spec-write puis merge) est refusé", () => {
    const { locks } = acquireLock([], spec(), T0);
    throwsA(() => acquireLock(locks, merge(), at(1)), NestedLockError);
  });

  it("V3 : ré-entrance refusée", () => {
    const { locks } = acquireLock([], merge(), T0);
    throwsA(() => acquireLock(locks, merge(), at(1)), NestedLockError);
  });
});

describe("CA3 verrous : séquence, expiration, titulaires", () => {
  it("V4 : séquentiel autorisé après libération", () => {
    const { locks } = acquireLock([], merge(), T0);
    const freed = releaseLock(locks, { kind: "merge", scope: "P" }, W);
    expect(freed).toEqual([]);
    const next = acquireLock(freed, spec(), at(1));
    expect(next.lock.kind).toBe("spec-write");
  });

  it("V5 : un verrou expiré n'est plus tenu (ni imbrication, ni conflit)", () => {
    const { locks } = acquireLock([], merge(), T0);
    expect(isLockActive(locks[0] as Lock, at(9, 59))).toBe(true);
    expect(isLockActive(locks[0] as Lock, at(10))).toBe(false);
    expect(acquireLock(locks, spec(), at(10)).lock.kind).toBe("spec-write");
    expect(acquireLock(locks, merge(V), at(10)).lock.holder).toEqual(V);
  });

  it("V6 : autre titulaire sur le même verrou : LockAlreadyHeldError ; autre projet accepté", () => {
    const { locks, lock } = acquireLock([], merge(), T0);
    try {
      acquireLock(locks, merge(V), at(1));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(LockAlreadyHeldError);
      expect(error).not.toBeInstanceOf(NestedLockError);
      expect((error as LockAlreadyHeldError).lock).toEqual(lock);
    }
    const other = acquireLock(locks, merge(V, "P2"), at(1));
    expect(other.locks).toHaveLength(2);
  });

  it("V7 : release par un non-titulaire ou d'un verrou absent refusé", () => {
    const { locks } = acquireLock([], merge(), T0);
    throwsA(() => releaseLock(locks, { kind: "merge", scope: "P" }, V), LockNotHeldByError);
    throwsA(() => releaseLock(locks, { kind: "merge", scope: "P2" }, W), LockNotHeldByError);
  });

  it("entrées non mutées, listes gelées", () => {
    const input: readonly Lock[] = Object.freeze([]);
    const { locks } = acquireLock(input, merge(), T0);
    expect(input).toHaveLength(0);
    expect(Object.isFrozen(locks)).toBe(true);
  });
});
