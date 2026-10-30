import { describe, expect, it } from "vitest";
import * as api from "../src/index.ts";
import { errors, INSTANT, isValid, UUID } from "./support.ts";

const ALL = [
  "ticket.create",
  "ticket.get",
  "ticket.list",
  "ticket.update",
  "ticket.delete",
  "ticket.transition",
  "dependency.add",
  "dependency.remove",
  "dependency.list",
  "sprint.create",
  "sprint.get",
  "sprint.list",
  "sprint.update",
  "sprint.activate",
  "sprint.close",
  "comment.create",
  "comment.list",
  "comment.delete",
  "projectState.get",
  "projectState.update",
  "lease.acquire",
  "lease.heartbeat",
  "lease.release",
  "lease.get",
  "audit.list",
];
/** Routes ouvertes à tous les rôles (lecture) : pas de FORBIDDEN, la matrice se teste côté API. */
const READ_FOR_ALL = [
  "ticket.get",
  "ticket.list",
  "dependency.list",
  "sprint.get",
  "sprint.list",
  "comment.list",
  "projectState.get",
  "lease.get",
];
/** Routes réservées à certains rôles du CDC §14 (ou à l'auteur/titulaire) : FORBIDDEN exposé. */
const ROLE_GATED = [
  "ticket.create",
  "ticket.update",
  "ticket.delete",
  "ticket.transition",
  "dependency.add",
  "dependency.remove",
  "sprint.create",
  "sprint.update",
  "sprint.activate",
  "sprint.close",
  "comment.delete",
  "projectState.update",
  "lease.acquire",
  "audit.list",
];
const NOT_FOUND = [
  "ticket.get",
  "ticket.update",
  "ticket.delete",
  "ticket.transition",
  "dependency.add",
  "dependency.remove",
  "dependency.list",
  "sprint.get",
  "sprint.update",
  "sprint.activate",
  "sprint.close",
  "comment.delete",
  "lease.acquire",
  "lease.heartbeat",
  "lease.release",
  "lease.get",
];

describe("E1 socle : INTERNAL partout, UNAUTHORIZED sauf health", () => {
  it.each(ALL)("%s expose INTERNAL 500 (requestId) et UNAUTHORIZED 401", async (name) => {
    expect(errors(name).INTERNAL?.status, name).toBe(500);
    expect(await isValid(errors(name).INTERNAL?.data, { requestId: "r" }), name).toBe(true);
    expect(errors(name).UNAUTHORIZED?.status, name).toBe(401);
  });
  it("health n'expose aucune erreur métier", () => {
    const codes = Object.keys(errors("health"));
    expect(codes).toEqual(["INTERNAL"]);
  });
});

describe("E2 rôles requis (§14) : FORBIDDEN et NOT_FOUND", () => {
  it.each(ROLE_GATED)("%s expose FORBIDDEN 403", (name) => {
    expect(errors(name).FORBIDDEN?.status, name).toBe(403);
  });
  it.each(READ_FOR_ALL)("%s (lecture pour tous les rôles) n'expose pas FORBIDDEN", (name) => {
    expect(errors(name).FORBIDDEN, name).toBeUndefined();
  });
  it("comment.create expose FORBIDDEN (rôle business sans droit d'écriture)", () => {
    expect(errors("comment.create").FORBIDDEN?.status).toBe(403);
  });
  it.each(NOT_FOUND)("%s expose NOT_FOUND 404 (ressource hors projet)", (name) => {
    expect(errors(name).NOT_FOUND?.status, name).toBe(404);
  });
});

describe("E3 CONFLICT.reason étendu (rétrocompatible)", () => {
  const OLD = ["slug_taken", "already_member", "already_invited", "last_owner"];
  const NEW = [
    "sprint_already_active",
    "sprint_not_planned",
    "sprint_not_active",
    "ticket_has_active_lease",
    "counter_limit_reached",
  ];
  it("accepte les anciennes et les nouvelles raisons, rejette le reste", async () => {
    const data = api.conflictError.CONFLICT.data;
    for (const reason of [...OLD, ...NEW]) {
      expect(await isValid(data, { reason }), reason).toBe(true);
    }
    expect(await isValid(data, { reason: "autre" })).toBe(false);
    expect(await isValid(api.conflictReasonSchema, "autre")).toBe(false);
  });
  it.each(["sprint.activate", "sprint.close", "ticket.delete", "ticket.transition"])(
    "%s expose CONFLICT 409",
    (name) => {
      expect(errors(name).CONFLICT?.status, name).toBe(409);
    },
  );
});

describe("E4 INVALID_TRANSITION", () => {
  const data = () => errors("ticket.transition").INVALID_TRANSITION?.data;
  it("409 sur ticket.transition, data { from, to } bornée aux statuts", async () => {
    expect(errors("ticket.transition").INVALID_TRANSITION?.status).toBe(409);
    expect(await isValid(data(), { from: "done", to: "todo" })).toBe(true);
    expect(await isValid(data(), { from: "done", to: "archived" })).toBe(false);
    expect(await isValid(data(), { from: "x", to: "todo" })).toBe(false);
    expect(await isValid(data(), { from: "done" })).toBe(false);
  });
});

describe("E5 DEPENDENCY_CYCLE", () => {
  const data = () => errors("dependency.add").DEPENDENCY_CYCLE?.data;
  it("409 sur dependency.add, data { path } liste de clés TK-n", async () => {
    expect(errors("dependency.add").DEPENDENCY_CYCLE?.status).toBe(409);
    expect(await isValid(data(), { path: ["TK-1", "TK-2", "TK-1"] })).toBe(true);
    expect(await isValid(data(), { path: ["TK-1", "x"] })).toBe(false);
    expect(await isValid(data(), { path: "TK-1" })).toBe(false);
    expect(await isValid(data(), {})).toBe(false);
  });
});

describe("E6 VERSION_CONFLICT", () => {
  const data = () => errors("projectState.update").VERSION_CONFLICT?.data;
  it("409 sur projectState.update, data avec l'état courant (version >= 1)", async () => {
    expect(errors("projectState.update").VERSION_CONFLICT?.status).toBe(409);
    expect(await isValid(data(), { expected: 1, current: { version: 2, content: {} } })).toBe(true);
    expect(await isValid(data(), { expected: 1, current: { version: 0, content: {} } })).toBe(
      false,
    );
    expect(await isValid(data(), { expected: 1.5, current: { version: 2, content: {} } })).toBe(
      false,
    );
    expect(await isValid(data(), { expected: 1 })).toBe(false);
    expect(await isValid(data(), { expected: 1, current: { version: 2, content: [] } })).toBe(
      false,
    );
  });
});

describe("E7 erreurs de bail", () => {
  const holder = { kind: "runner", id: "R1" };
  it("LEASE_HELD 409 sur lease.acquire : { ticket, holder, expiresAt }", async () => {
    const e = errors("lease.acquire").LEASE_HELD;
    expect(e?.status).toBe(409);
    expect(await isValid(e?.data, { ticket: "TK-1", holder, expiresAt: INSTANT })).toBe(true);
    expect(await isValid(e?.data, { ticket: "TK-1", holder })).toBe(false);
    expect(
      await isValid(e?.data, {
        ticket: "TK-1",
        holder: { kind: "x", id: "a" },
        expiresAt: INSTANT,
      }),
    ).toBe(false);
  });
  it("LEASE_EXPIRED 409 sur lease.heartbeat : { ticket, expiresAt }", async () => {
    const e = errors("lease.heartbeat").LEASE_EXPIRED;
    expect(e?.status).toBe(409);
    expect(await isValid(e?.data, { ticket: "TK-1", expiresAt: INSTANT })).toBe(true);
    expect(await isValid(e?.data, { ticket: "TK-0", expiresAt: INSTANT })).toBe(false);
    expect(await isValid(e?.data, { ticket: "TK-1" })).toBe(false);
  });
  it.each(["lease.heartbeat", "lease.release"])(
    "LEASE_NOT_HOLDER 403 sur %s : { ticket, holder }",
    async (name) => {
      const e = errors(name).LEASE_NOT_HOLDER;
      expect(e?.status).toBe(403);
      expect(await isValid(e?.data, { ticket: "TK-1", holder: { kind: "member", id: UUID } })).toBe(
        true,
      );
      expect(await isValid(e?.data, { ticket: "TK-1" })).toBe(false);
    },
  );
});

describe("E8 VALIDATION", () => {
  it.each(["ticket.create", "ticket.update", "sprint.create", "sprint.update"])(
    "%s expose VALIDATION 422 : { field, message }",
    async (name) => {
      const e = errors(name).VALIDATION;
      expect(e?.status, name).toBe(422);
      expect(await isValid(e?.data, { field: "pkg", message: "paquet inconnu" }), name).toBe(true);
      expect(await isValid(e?.data, { field: "pkg" }), name).toBe(false);
      expect(await isValid(e?.data, { message: "m" }), name).toBe(false);
    },
  );
});

describe("E9 exposition exclusive des erreurs typées", () => {
  const exposers: Record<string, string[]> = {
    INVALID_TRANSITION: ["ticket.transition"],
    DEPENDENCY_CYCLE: ["dependency.add"],
    VERSION_CONFLICT: ["projectState.update"],
    LEASE_HELD: ["lease.acquire"],
    LEASE_EXPIRED: ["lease.heartbeat"],
  };
  it.each(Object.entries(exposers))("%s n'apparaît que sur ses routes", (code, routes) => {
    for (const name of ALL) {
      expect(errors(name)[code] !== undefined, `${name} ${code}`).toBe(routes.includes(name));
    }
  });
  it("LEASE_NOT_HOLDER n'apparaît que sur heartbeat, release (et transition si bail requis)", () => {
    const allowed = ["lease.heartbeat", "lease.release", "ticket.transition"];
    for (const name of ALL) {
      if (!allowed.includes(name)) expect(errors(name).LEASE_NOT_HOLDER, name).toBeUndefined();
    }
  });
  it("ticket.get et ticket.list n'exposent aucune erreur de bail", () => {
    for (const name of ["ticket.get", "ticket.list"]) {
      for (const code of ["LEASE_HELD", "LEASE_EXPIRED", "LEASE_NOT_HOLDER"]) {
        expect(errors(name)[code], `${name} ${code}`).toBeUndefined();
      }
    }
  });
});

describe("E10 erreurs partagées exportées de l'index", () => {
  it("chaque erreur typée a son déclarateur, comme conflictError", () => {
    expect(api.invalidTransitionError.INVALID_TRANSITION.status).toBe(409);
    expect(api.dependencyCycleError.DEPENDENCY_CYCLE.status).toBe(409);
    expect(api.versionConflictError.VERSION_CONFLICT.status).toBe(409);
    expect(api.leaseHeldError.LEASE_HELD.status).toBe(409);
    expect(api.leaseExpiredError.LEASE_EXPIRED.status).toBe(409);
    expect(api.leaseNotHolderError.LEASE_NOT_HOLDER.status).toBe(403);
    expect(api.validationError.VALIDATION.status).toBe(422);
  });
});
