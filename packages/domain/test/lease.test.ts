import { describe, expect, it } from "vitest";
import {
  acquireLease,
  activeLeaseFor,
  DEFAULT_LEASE_TTL_MS,
  type Holder,
  heartbeat,
  InvalidInstantError,
  InvalidLeaseError,
  InvalidTicketKeyError,
  isActive,
  type Lease,
  LeaseAlreadyHeldError,
  LeaseExpiredError,
  LeaseNotHeldByError,
  release,
  releaseExpired,
} from "../src/index.ts";
import { at, member, runner, T0, throwsA } from "./clock-helpers.ts";

const request = (
  ticket: string,
  holder: Holder = runner("R1"),
  extra: Record<string, unknown> = {},
) => ({
  ticket,
  holder,
  branch: `feat/${ticket.toLowerCase()}`,
  worktree: `/work/${ticket.toLowerCase()}`,
  ...extra,
});

const take = (leases: readonly Lease[], ticket: string, holder: Holder = runner("R1"), now = T0) =>
  acquireLease(leases, request(ticket, holder), now);

describe("incident-03-expired-lease-frees-ticket", () => {
  it("incident-03-expired-lease-frees-ticket", () => {
    const { lease: first, leases } = take([], "TK-1", runner("R1"));
    const snapshot = JSON.stringify(first);

    // L1 : à 14 min 59 s le bail est actif, un second acquéreur est refusé avec le bail actif.
    expect(activeLeaseFor(leases, "TK-1", at(14, 59))).toEqual(first);
    try {
      acquireLease(leases, request("TK-1", runner("R2")), at(14, 59));
      expect.unreachable("LeaseAlreadyHeldError attendue");
    } catch (error) {
      expect(error).toBeInstanceOf(LeaseAlreadyHeldError);
      expect((error as LeaseAlreadyHeldError).lease).toEqual(first);
    }

    // L2 : à la borne puis après, le ticket est libre sans aucune étape de récupération.
    for (const now of [at(15), at(15, 1)]) {
      expect(activeLeaseFor(leases, "TK-1", now)).toBeNull();
      const { lease: second, leases: after } = acquireLease(
        leases,
        request("TK-1", runner("R2")),
        now,
      );
      expect(second.holder).toEqual(runner("R2"));
      expect(activeLeaseFor(after, "TK-1", now)).toEqual(second);
      expect(JSON.stringify(first)).toBe(snapshot);
    }
  });

  it("L3 : le titulaire expiré ne peut plus battre", () => {
    const { lease } = take([], "TK-1");
    throwsA(() => heartbeat(lease, runner("R1"), at(16)), LeaseExpiredError);
    throwsA(() => heartbeat(lease, runner("R1"), at(15)), LeaseExpiredError);
  });

  it("L4 : releaseExpired sépare actifs et expirés, sans muter, de façon idempotente", () => {
    const a = take([], "TK-1", runner("R1"), T0);
    const b = acquireLease(a.leases, request("TK-2", runner("R2")), at(10));
    const input = Object.freeze([...b.leases]);
    const before = JSON.stringify(input);
    const result = releaseExpired(input, at(16));
    expect(result.expired).toEqual([a.lease]);
    expect(result.active).toEqual([b.lease]);
    expect(JSON.stringify(input)).toBe(before);
    const again = releaseExpired(result.active, at(16));
    expect(again.active).toEqual(result.active);
    expect(again.expired).toEqual([]);
  });

  it("L5 : l'expiration d'un ticket n'affecte pas les autres tickets", () => {
    const a = take([], "TK-1", runner("R1"), T0);
    const b = acquireLease(a.leases, request("TK-2", runner("R2")), at(10));
    expect(activeLeaseFor(b.leases, "TK-1", at(16))).toBeNull();
    expect(activeLeaseFor(b.leases, "TK-2", at(16))).toEqual(b.lease);
  });
});

describe("CA2 bail : cas complémentaires", () => {
  it("TTL par défaut de 15 minutes et champs du bail", () => {
    expect(DEFAULT_LEASE_TTL_MS).toBe(900_000);
    const { lease } = take([], "TK-1");
    expect(lease).toMatchObject({
      ticket: "TK-1",
      holder: runner("R1"),
      branch: "feat/tk-1",
      worktree: "/work/tk-1",
      acquiredAt: T0,
      heartbeatAt: T0,
      expiresAt: at(15),
    });
  });

  it("bornes d'expiration : actif ssi now < expiresAt (borne exclusive)", () => {
    const { lease } = take([], "TK-1");
    expect(isActive(lease, at(14, 59))).toBe(true);
    expect(isActive(lease, at(15))).toBe(false);
    expect(isActive(lease, at(15, 1))).toBe(false);
  });

  it("TTL surchargeable", () => {
    const { lease } = acquireLease([], request("TK-1", runner("R1"), { ttlMs: 60_000 }), T0);
    expect(lease.expiresAt).toBe(at(1));
  });
});

describe("CA2 bail : unicité et titulaires", () => {
  it("B1 : un seul bail actif par ticket, deux tickets différents réussissent", () => {
    const first = take([], "TK-1", runner("R1"));
    throwsA(
      () => acquireLease(first.leases, request("TK-1", runner("R2")), T0),
      LeaseAlreadyHeldError,
    );
    const other = acquireLease(first.leases, request("TK-2", runner("R2")), T0);
    expect(other.leases).toHaveLength(2);
  });

  it("B2 : un bail de membre bloque un runner", () => {
    const { leases, lease } = take([], "TK-1", member("alice"));
    throwsA(
      () => acquireLease(leases, request("TK-1", runner("R1")), at(1)),
      LeaseAlreadyHeldError,
    );
    expect(lease.holder).toEqual(member("alice"));
  });

  it("B3 : branche ou worktree vides, clé invalide, instant invalide", () => {
    for (const field of ["branch", "worktree"]) {
      try {
        acquireLease([], request("TK-1", runner("R1"), { [field]: "" }), T0);
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidLeaseError);
        expect((error as InvalidLeaseError).field).toBe(field);
      }
    }
    throwsA(() => acquireLease([], request("tk-1"), T0), InvalidTicketKeyError);
    throwsA(
      () => acquireLease([], request("TK-1", { kind: "runner", id: "" }), T0),
      InvalidLeaseError,
    );
    throwsA(() => acquireLease([], request("TK-1"), "pas une date"), InvalidInstantError);
  });
});

describe("CA2 bail : battement et mauvais titulaire", () => {
  it("B4 : un battement repousse l'expiration à now + ttl", () => {
    const { lease } = take([], "TK-1");
    const beaten = heartbeat(lease, runner("R1"), at(10));
    expect(beaten.heartbeatAt).toBe(at(10));
    expect(beaten.expiresAt).toBe(at(25));
    expect(beaten.acquiredAt).toBe(T0);
    expect(isActive(beaten, at(20))).toBe(true);
    expect(isActive(beaten, at(25))).toBe(false);
    expect(lease.expiresAt).toBe(at(15));
  });

  it("B5 : mauvais titulaire pour heartbeat et release", () => {
    const { lease } = take([], "TK-1");
    const before = JSON.stringify(lease);
    throwsA(() => heartbeat(lease, runner("R2"), at(1)), LeaseNotHeldByError);
    throwsA(() => release(lease, runner("R2")), LeaseNotHeldByError);
    throwsA(() => release(lease, member("R1")), LeaseNotHeldByError);
    expect(JSON.stringify(lease)).toBe(before);
  });
});

describe("CA2 bail : libération, TTL, immutabilité", () => {
  it("B6 : après release, le ticket est reprenable avant expiration", () => {
    const { lease } = take([], "TK-1");
    const released = release(lease, runner("R1"));
    expect(isActive(released, at(1))).toBe(false);
    expect(activeLeaseFor([released], "TK-1", at(1))).toBeNull();
    const next = acquireLease([released], request("TK-1", runner("R2")), at(1));
    expect(next.lease.holder).toEqual(runner("R2"));
    expect(isActive(lease, at(1))).toBe(true);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("B7 : TTL %s refusé", (ttlMs) => {
    throwsA(
      () => acquireLease([], request("TK-1", runner("R1"), { ttlMs }), T0),
      InvalidLeaseError,
    );
  });

  it("B8 : résultats gelés, entrées non mutées", () => {
    const input: readonly Lease[] = Object.freeze([]);
    const { lease, leases } = acquireLease(input, request("TK-1"), T0);
    expect(input).toHaveLength(0);
    expect(Object.isFrozen(lease)).toBe(true);
    expect(Object.isFrozen(lease.holder)).toBe(true);
    expect(Object.isFrozen(leases)).toBe(true);
    expect(Object.isFrozen(heartbeat(lease, runner("R1"), at(1)))).toBe(true);
    expect(Object.isFrozen(release(lease, runner("R1")))).toBe(true);
  });

  it("un titulaire peut tenir plusieurs baux sur des tickets différents", () => {
    const a = take([], "TK-1", runner("R1"));
    const b = acquireLease(a.leases, request("TK-2", runner("R1")), T0);
    expect(b.leases).toHaveLength(2);
  });
});
