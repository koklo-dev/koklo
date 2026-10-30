import { describe, expect, it } from "vitest";
import * as schemas from "../src/schemas.ts";
import {
  auditEntry,
  BAD_TICKET_KEYS,
  comment,
  INSTANT,
  input,
  isValid,
  lease,
  output,
  parsed,
  proc,
  UUID,
} from "./support.ts";

const targetInput = { targetKind: "ticket", targetId: UUID, body: "Bonjour" };

describe("M0 groupes comment, projectState, lease, audit : présence", () => {
  it.each(["comment.create", "comment.list", "comment.delete"])("%s existe", (name) => {
    expect(proc(name)).toBeDefined();
  });
  it.each(["projectState.get", "projectState.update"])("%s existe", (name) => {
    expect(proc(name)).toBeDefined();
  });
  it.each(["acquire", "heartbeat", "release", "get"])("lease.%s existe", (name) => {
    expect(proc(`lease.${name}`)).toBeDefined();
  });
  it("audit.list existe et le groupe audit est en lecture seule", async () => {
    const { contract } = await import("../src/index.ts");
    expect(proc("audit.list")).toBeDefined();
    expect(Object.keys((contract as Record<string, object>).audit ?? {})).toEqual(["list"]);
  });
});

describe("M1 comment.create : entrée", () => {
  const i = () => input("comment.create");
  it("accepte chaque cible et un corps de 1 à 8000 caractères", async () => {
    for (const targetKind of ["ticket", "feature", "screen", "change_request"]) {
      expect(await isValid(i(), { ...targetInput, targetKind }), targetKind).toBe(true);
    }
    expect(await isValid(i(), { ...targetInput, body: "a".repeat(8000) })).toBe(true);
  });
  it("rejette cible inconnue, corps vide ou > 8000, champs absents", async () => {
    expect(await isValid(i(), { ...targetInput, targetKind: "sprint" })).toBe(false);
    expect(await isValid(i(), { ...targetInput, body: "" })).toBe(false);
    expect(await isValid(i(), { ...targetInput, body: "a".repeat(8001) })).toBe(false);
    expect(await isValid(i(), { targetKind: "ticket", body: "x" })).toBe(false);
    expect(await isValid(i(), { targetKind: "ticket", targetId: UUID })).toBe(false);
  });
  it("ne conserve jamais l'auteur (déduit du jeton)", async () => {
    const value = await parsed(i(), { ...targetInput, authorKind: "system", authorId: UUID });
    expect(value === undefined || !("authorKind" in value || "authorId" in value)).toBe(true);
  });
});

describe("M2 commentSchema, comment.list, comment.delete", () => {
  it("sortie de create : commentaire complet, auteur d'un type connu", async () => {
    const o = output("comment.create");
    expect(await isValid(o, comment)).toBe(true);
    expect(await isValid(o, { ...comment, authorKind: "robot" })).toBe(false);
    expect(await isValid(o, { ...comment, targetKind: "sprint" })).toBe(false);
    expect(await isValid(o, { ...comment, id: "x" })).toBe(false);
    expect(await isValid(o, { ...comment, createdAt: "hier" })).toBe(false);
    expect(await isValid(schemas.commentSchema, comment)).toBe(true);
  });
  it("list : cible obligatoire, pagination, sortie { items, nextCursor }", async () => {
    const i = input("comment.list");
    expect(await isValid(i, { targetKind: "ticket", targetId: UUID })).toBe(true);
    expect(
      await isValid(i, { targetKind: "ticket", targetId: UUID, limit: 100, cursor: "c" }),
    ).toBe(true);
    expect(await isValid(i, { targetKind: "ticket" })).toBe(false);
    expect(await isValid(i, { targetKind: "x", targetId: UUID })).toBe(false);
    expect(await isValid(i, { targetKind: "ticket", targetId: UUID, limit: 101 })).toBe(false);
    const o = output("comment.list");
    expect(await isValid(o, { items: [comment], nextCursor: null })).toBe(true);
    expect(await isValid(o, [comment])).toBe(false);
  });
  it("delete : { id uuid } -> { id }", async () => {
    expect(await isValid(input("comment.delete"), { id: UUID })).toBe(true);
    expect(await isValid(input("comment.delete"), { id: "12" })).toBe(false);
    expect(await isValid(output("comment.delete"), { id: UUID })).toBe(true);
    expect(await isValid(output("comment.delete"), {})).toBe(false);
  });
});

describe("P1 projectState.get et projectStateSchema", () => {
  it("get : aucune entrée requise (projet actif de la session)", async () => {
    const i = input("projectState.get");
    if (i) expect(await isValid(i, {})).toBe(true);
    expect(proc("projectState.get")).toBeDefined();
  });
  it("sortie : version entière >= 1 et contenu objet", async () => {
    const o = output("projectState.get");
    expect(await isValid(o, { version: 1, content: {} })).toBe(true);
    expect(await isValid(o, { version: 7, content: { a: { b: [1] } } })).toBe(true);
    for (const version of [0, -1, 1.5, "1"]) {
      expect(await isValid(o, { version, content: {} }), String(version)).toBe(false);
    }
    for (const content of [[], "x", null, 3]) {
      expect(await isValid(o, { version: 1, content }), JSON.stringify(content)).toBe(false);
    }
    expect(await isValid(schemas.projectStateSchema, { version: 1, content: {} })).toBe(true);
    expect(await isValid(schemas.projectStateSchema, { version: 0, content: {} })).toBe(false);
  });
});

describe("P2 projectState.update : écriture optimiste", () => {
  const i = () => input("projectState.update");
  it("accepte { expectedVersion >= 1, content objet }", async () => {
    expect(await isValid(i(), { expectedVersion: 1, content: {} })).toBe(true);
    expect(await isValid(i(), { expectedVersion: 12, content: { policy: "auto" } })).toBe(true);
  });
  it("rejette version 0, non entière ou non numérique, contenu non objet, champ absent", async () => {
    for (const expectedVersion of [0, -2, 1.5, "1", null]) {
      expect(await isValid(i(), { expectedVersion, content: {} }), String(expectedVersion)).toBe(
        false,
      );
    }
    for (const content of [[], "x", null, 3]) {
      expect(await isValid(i(), { expectedVersion: 1, content }), JSON.stringify(content)).toBe(
        false,
      );
    }
    expect(await isValid(i(), { content: {} })).toBe(false);
    expect(await isValid(i(), { expectedVersion: 1 })).toBe(false);
  });
  it("sortie : { version, content }", async () => {
    const o = output("projectState.update");
    expect(await isValid(o, { version: 2, content: {} })).toBe(true);
    expect(await isValid(o, { version: 0, content: {} })).toBe(false);
  });
});

describe("L1 lease.acquire : entrée", () => {
  const i = () => input("lease.acquire");
  const base = { key: "TK-1", branch: "feat/tk-1", worktree: "/work/tk-1" };
  it("accepte branche, worktree et ttlMs optionnel > 0", async () => {
    expect(await isValid(i(), base)).toBe(true);
    expect(await isValid(i(), { ...base, ttlMs: 60_000 })).toBe(true);
  });
  it("rejette ttlMs <= 0, branche ou worktree vides, clé mal formée", async () => {
    for (const ttlMs of [0, -1, "1"]) {
      expect(await isValid(i(), { ...base, ttlMs }), String(ttlMs)).toBe(false);
    }
    expect(await isValid(i(), { ...base, branch: "" })).toBe(false);
    expect(await isValid(i(), { ...base, worktree: "" })).toBe(false);
    expect(await isValid(i(), { key: "TK-1", branch: "b" })).toBe(false);
    for (const key of BAD_TICKET_KEYS)
      expect(await isValid(i(), { ...base, key }), key).toBe(false);
  });
  it("ne conserve jamais le titulaire (déduit du jeton)", async () => {
    const value = await parsed(i(), { ...base, holder: { kind: "runner", id: "R1" } });
    expect(value === undefined || !("holder" in value)).toBe(true);
  });
});

describe("L2 leaseSchema : sortie", () => {
  it("acquire, heartbeat, release renvoient leaseSchema", async () => {
    for (const name of ["acquire", "heartbeat", "release"]) {
      const o = output(`lease.${name}`);
      expect(await isValid(o, lease), name).toBe(true);
      expect(await isValid(o, { ...lease, released: true }), name).toBe(true);
      expect(await isValid(o, { ...lease, holder: { kind: "user", id: "u" } }), name).toBe(false);
    }
    expect(await isValid(schemas.leaseSchema, lease)).toBe(true);
  });
  it("titulaire member ou runner seulement, champs obligatoires, ttlMs positif", async () => {
    const o = schemas.leaseSchema;
    expect(await isValid(o, { ...lease, holder: { kind: "member", id: UUID } })).toBe(true);
    for (const patch of [
      { ttlMs: 0 },
      { released: "non" },
      { expiresAt: "bientôt" },
      { ticket: "TK-0" },
    ]) {
      expect(await isValid(o, { ...lease, ...patch }), JSON.stringify(patch)).toBe(false);
    }
    for (const field of Object.keys(lease)) {
      expect(await isValid(o, { ...lease, [field]: undefined }), field).toBe(false);
    }
  });
  it("heartbeat, release, get : { key }", async () => {
    for (const name of ["heartbeat", "release", "get"]) {
      expect(await isValid(input(`lease.${name}`), { key: "TK-1" }), name).toBe(true);
      expect(await isValid(input(`lease.${name}`), { key: "TK-0" }), name).toBe(false);
    }
  });
  it("get : bail ou null", async () => {
    const o = output("lease.get");
    expect(await isValid(o, null)).toBe(true);
    expect(await isValid(o, lease)).toBe(true);
    expect(await isValid(o, { ...lease, released: "x" })).toBe(false);
    expect(await isValid(o, undefined)).toBe(false);
  });
});

describe("A1 audit.list : lecture seule", () => {
  const i = () => input("audit.list");
  it("accepte aucun filtre et tous les filtres", async () => {
    expect(await isValid(i(), {})).toBe(true);
    expect(
      await isValid(i(), {
        ticketKey: "TK-1",
        actorKind: "runner",
        action: "lease.acquire",
        from: INSTANT,
        to: INSTANT,
        limit: 100,
        cursor: "c",
      }),
    ).toBe(true);
  });
  it("rejette acteur inconnu, clé mal formée, dates non ISO, limit hors bornes", async () => {
    expect(await isValid(i(), { actorKind: "bot" })).toBe(false);
    expect(await isValid(i(), { ticketKey: "TK-0" })).toBe(false);
    expect(await isValid(i(), { from: "hier" })).toBe(false);
    expect(await isValid(i(), { to: "demain" })).toBe(false);
    for (const limit of [0, 101, 2.5])
      expect(await isValid(i(), { limit }), String(limit)).toBe(false);
  });
  it("sortie : { items: auditEntry[], nextCursor }", async () => {
    const o = output("audit.list");
    const full = { ...auditEntry, actorId: UUID, tokenId: UUID, ticketKey: "TK-1" };
    expect(await isValid(o, { items: [auditEntry], nextCursor: null })).toBe(true);
    expect(await isValid(o, { items: [full], nextCursor: "c" })).toBe(true);
    expect(await isValid(schemas.auditEntrySchema, full)).toBe(true);
  });
  it("auditEntry rejette un acteur inconnu et les champs obligatoires absents", async () => {
    const s = schemas.auditEntrySchema;
    expect(await isValid(s, { ...auditEntry, actorKind: "bot" })).toBe(false);
    expect(await isValid(s, { ...auditEntry, occurredAt: "hier" })).toBe(false);
    expect(await isValid(s, { ...auditEntry, ticketKey: "TK-0" })).toBe(false);
    for (const field of ["id", "actorKind", "action", "targetKind", "targetId", "occurredAt"]) {
      expect(await isValid(s, { ...auditEntry, [field]: undefined }), field).toBe(false);
    }
  });
});
