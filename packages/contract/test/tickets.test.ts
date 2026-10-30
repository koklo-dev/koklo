import { describe, expect, it } from "vitest";
import * as schemas from "../src/schemas.ts";
import {
  BAD_SPRINT_KEYS,
  BAD_TICKET_KEYS,
  INSTANT,
  input,
  isValid,
  output,
  PACKAGES,
  PRIORITIES,
  parsed,
  proc,
  STATUSES,
  TYPES,
  ticket,
  UUID,
} from "./support.ts";

const create = {
  title: "Titre",
  type: "feature",
  priority: "high",
  pkg: "api",
  sensitivity: "safe",
};

describe("T0 groupe ticket : présence", () => {
  it.each(["create", "get", "list", "update", "delete", "transition"])(
    "ticket.%s existe",
    (name) => {
      expect(proc(`ticket.${name}`)).toBeDefined();
    },
  );
});

describe("T1 énumérations du contrat (copie en dur des valeurs du domaine)", () => {
  const accepted = async (schema: unknown, values: string[]) => {
    for (const v of values) expect(await isValid(schema as never, v), v).toBe(true);
    expect(await isValid(schema as never, "autre")).toBe(false);
  };
  it("statut, type, priorité", async () => {
    await accepted(schemas.ticketStatusSchema, STATUSES);
    await accepted(schemas.ticketTypeSchema, TYPES);
    await accepted(schemas.ticketPrioritySchema, PRIORITIES);
  });
  it("paquet (15), sensibilité, type de dépendance, titulaire de bail", async () => {
    await accepted(schemas.ticketPackageSchema, PACKAGES);
    await accepted(schemas.sensitivitySchema, ["safe", "sensitive"]);
    await accepted(schemas.dependencyTypeSchema, ["blocks", "related"]);
    await accepted(schemas.holderKindSchema, ["member", "runner"]);
  });
  it("sprint, cible de commentaire, auteur, acteur d'audit", async () => {
    await accepted(schemas.sprintStatusSchema, ["planned", "active", "closed"]);
    await accepted(schemas.commentTargetKindSchema, [
      "ticket",
      "feature",
      "screen",
      "change_request",
    ]);
    await accepted(schemas.commentAuthorKindSchema, ["human", "agent", "client", "system"]);
    await accepted(schemas.auditActorKindSchema, ["human", "agent", "runner", "system"]);
  });
});

describe("T2 clés et instants", () => {
  it("ticketKeySchema : TK-n, n >= 1 sans zéro initial", async () => {
    for (const k of ["TK-1", "TK-29", "TK-1000"]) {
      expect(await isValid(schemas.ticketKeySchema, k)).toBe(true);
    }
    for (const k of BAD_TICKET_KEYS)
      expect(await isValid(schemas.ticketKeySchema, k), k).toBe(false);
  });
  it("sprintKeySchema : SP-n, n >= 1 sans zéro initial", async () => {
    for (const k of ["SP-1", "SP-12"]) expect(await isValid(schemas.sprintKeySchema, k)).toBe(true);
    for (const k of BAD_SPRINT_KEYS)
      expect(await isValid(schemas.sprintKeySchema, k), k).toBe(false);
  });
  it("instantSchema : ISO-8601 UTC seulement", async () => {
    expect(await isValid(schemas.instantSchema, INSTANT)).toBe(true);
    for (const v of ["demain", "2026-11-04", "2026-11-04T10:00:00+02:00", 12]) {
      expect(await isValid(schemas.instantSchema, v), String(v)).toBe(false);
    }
  });
});

describe("T3 ticket.create : entrée", () => {
  const i = () => input("ticket.create");
  it("accepte le minimum et une entrée complète", async () => {
    expect(await isValid(i(), create)).toBe(true);
    expect(
      await isValid(i(), {
        ...create,
        description: "Détail",
        status: "todo",
        sprintId: "SP-1",
        assignee: { kind: "member", id: UUID },
        labels: ["front"],
        estimateHours: 0,
        linkedFeatures: ["F-1"],
        criteria: [{ statement: "Le contrat est publié" }, { statement: "x", specRef: "§7.1" }],
      }),
    ).toBe(true);
  });
  it("statut initial : backlog ou todo seulement", async () => {
    for (const status of ["backlog", "todo"]) {
      expect(await isValid(i(), { ...create, status })).toBe(true);
    }
    for (const status of ["in_progress", "in_review", "blocked", "done", "cancelled", "x"]) {
      expect(await isValid(i(), { ...create, status }), status).toBe(false);
    }
  });
  it("rejette titre vide ou > 200, champs obligatoires absents", async () => {
    expect(await isValid(i(), { ...create, title: "a".repeat(200) })).toBe(true);
    expect(await isValid(i(), { ...create, title: "" })).toBe(false);
    expect(await isValid(i(), { ...create, title: "a".repeat(201) })).toBe(false);
    for (const field of Object.keys(create)) {
      expect(await isValid(i(), { ...create, [field]: undefined }), field).toBe(false);
    }
  });
  it("rejette type, priorité, paquet, sensibilité hors liste (et paquet multiple)", async () => {
    for (const patch of [
      { type: "epic" },
      { priority: "urgent" },
      { pkg: "mobile" },
      { pkg: ["web", "api"] },
      { sensitivity: "secret" },
    ]) {
      expect(await isValid(i(), { ...create, ...patch }), JSON.stringify(patch)).toBe(false);
    }
  });
  it("rejette estimation négative, sprint mal formé, critère sans énoncé", async () => {
    expect(await isValid(i(), { ...create, estimateHours: -1 })).toBe(false);
    for (const sprintId of BAD_SPRINT_KEYS) {
      expect(await isValid(i(), { ...create, sprintId }), sprintId).toBe(false);
    }
    expect(await isValid(i(), { ...create, criteria: [{ specRef: "§1" }] })).toBe(false);
    expect(await isValid(i(), { ...create, assignee: "alice" })).toBe(false);
    expect(await isValid(i(), { ...create, assignee: { kind: "robot", id: UUID } })).toBe(false);
  });
  it("ne conserve jamais l'organisation ni le projet (déduits de la session)", async () => {
    const value = await parsed(i(), { ...create, organizationId: UUID, projectId: UUID });
    expect(value === undefined || !("organizationId" in value || "projectId" in value)).toBe(true);
  });
});

describe("T4 ticketSchema : sortie", () => {
  const o = () => output("ticket.create");
  it("accepte un ticket complet, avec sprint et affectation", async () => {
    expect(await isValid(o(), ticket)).toBe(true);
    expect(await isValid(o(), { ...ticket, sprint: "SP-2", estimateHours: 3.5 })).toBe(true);
    expect(await isValid(schemas.ticketSchema, ticket)).toBe(true);
  });
  it("rejette statut inconnu, paquet multiple, clé ou id mal formés, champ absent", async () => {
    for (const patch of [
      { status: "unknown" },
      { pkg: ["web", "api"] },
      { key: "TK-0" },
      { id: "x" },
      { sprint: "SP-0" },
      { createdAt: "hier" },
      { attempts: -1 },
    ]) {
      expect(await isValid(o(), { ...ticket, ...patch }), JSON.stringify(patch)).toBe(false);
    }
    for (const field of Object.keys(ticket)) {
      expect(await isValid(o(), { ...ticket, [field]: undefined }), field).toBe(false);
    }
  });
  it("toutes les procédures de ticket renvoient ticketSchema (sauf get, list, delete)", async () => {
    for (const name of ["update", "transition"]) {
      expect(await isValid(output(`ticket.${name}`), ticket), name).toBe(true);
      expect(await isValid(output(`ticket.${name}`), { ...ticket, status: "x" }), name).toBe(false);
    }
  });
});

describe("T5 ticket.get : détail", () => {
  const detail = {
    ...ticket,
    criteria: [{ statement: "Le contrat est publié", specRef: null }],
    dependencies: [{ ticket: "TK-29", dependsOn: "TK-21", type: "blocks" }],
    lease: null,
  };
  it("entrée : clé TK-n", async () => {
    expect(await isValid(input("ticket.get"), { key: "TK-1" })).toBe(true);
    for (const key of BAD_TICKET_KEYS) {
      expect(await isValid(input("ticket.get"), { key }), key).toBe(false);
    }
    expect(await isValid(input("ticket.get"), {})).toBe(false);
  });
  it("sortie : ticket + critères, dépendances, bail actif éventuel", async () => {
    const o = output("ticket.get");
    expect(await isValid(o, detail)).toBe(true);
    expect(await isValid(o, { ...detail, lease: { ...leaseSample(), released: false } })).toBe(
      true,
    );
    expect(await isValid(o, { ...detail, dependencies: [{ ticket: "TK-1" }] })).toBe(false);
    expect(await isValid(o, { ...detail, criteria: undefined })).toBe(false);
    expect(await isValid(o, { ...detail, lease: undefined })).toBe(false);
  });
});

const leaseSample = () => ({
  ticket: "TK-29",
  holder: { kind: "member", id: UUID },
  branch: "b",
  worktree: "/w",
  acquiredAt: INSTANT,
  heartbeatAt: INSTANT,
  expiresAt: INSTANT,
  ttlMs: 1,
  released: false,
});

describe("T6 ticket.list", () => {
  const i = () => input("ticket.list");
  it("accepte aucun filtre, tous les filtres, limit 1..100", async () => {
    expect(await isValid(i(), {})).toBe(true);
    expect(
      await isValid(i(), { status: "todo", sprintId: "SP-1", pkg: "api", limit: 100, cursor: "c" }),
    ).toBe(true);
    expect(await isValid(i(), { limit: 1 })).toBe(true);
  });
  it("rejette statut ou paquet hors liste, limit hors bornes ou non entier", async () => {
    expect(await isValid(i(), { status: "x" })).toBe(false);
    expect(await isValid(i(), { pkg: "x" })).toBe(false);
    for (const limit of [0, -1, 101, 1.5]) {
      expect(await isValid(i(), { limit }), String(limit)).toBe(false);
    }
  });
  it("sortie : { items, nextCursor } paginée", async () => {
    const o = output("ticket.list");
    expect(await isValid(o, { items: [], nextCursor: null })).toBe(true);
    expect(await isValid(o, { items: [ticket], nextCursor: "abc" })).toBe(true);
    expect(await isValid(o, { items: [{ ...ticket, status: "x" }], nextCursor: null })).toBe(false);
    expect(await isValid(o, [ticket])).toBe(false);
  });
});

describe("T7 ticket.update : le statut passe par transition", () => {
  const i = () => input("ticket.update");
  it("accepte une clé et des champs modifiables", async () => {
    expect(await isValid(i(), { key: "TK-1", title: "Nouveau" })).toBe(true);
    expect(
      await isValid(i(), {
        key: "TK-1",
        description: "d",
        priority: "low",
        pkg: "db",
        sensitivity: "sensitive",
        sprintId: "SP-3",
        labels: ["a"],
        estimateHours: 2,
        linkedFeatures: [],
        assignee: { kind: "runner", id: "R1" },
      }),
    ).toBe(true);
  });
  it("rejette status (entrée stricte), champs invalides, clé mal formée", async () => {
    expect(await isValid(i(), { key: "TK-1", status: "done" })).toBe(false);
    expect(await isValid(i(), { key: "TK-1", title: "" })).toBe(false);
    expect(await isValid(i(), { key: "TK-1", title: "a".repeat(201) })).toBe(false);
    expect(await isValid(i(), { key: "TK-1", pkg: ["web", "api"] })).toBe(false);
    expect(await isValid(i(), { key: "TK-1", estimateHours: -1 })).toBe(false);
    expect(await isValid(i(), { key: "TK-1", priority: "x" })).toBe(false);
    for (const key of BAD_TICKET_KEYS)
      expect(await isValid(i(), { key, title: "t" }), key).toBe(false);
  });
});

describe("T8 ticket.delete et ticket.transition", () => {
  it("delete : { key } -> { key }", async () => {
    expect(await isValid(input("ticket.delete"), { key: "TK-1" })).toBe(true);
    expect(await isValid(input("ticket.delete"), { key: "tk-1" })).toBe(false);
    expect(await isValid(output("ticket.delete"), { key: "TK-1" })).toBe(true);
    expect(await isValid(output("ticket.delete"), {})).toBe(false);
  });
  it("transition : { key, to } avec un statut de la liste", async () => {
    const i = input("ticket.transition");
    for (const to of STATUSES) expect(await isValid(i, { key: "TK-1", to }), to).toBe(true);
    expect(await isValid(i, { key: "TK-1", to: "archived" })).toBe(false);
    expect(await isValid(i, { key: "TK-1" })).toBe(false);
    expect(await isValid(i, { key: "TK-0", to: "done" })).toBe(false);
  });
});
