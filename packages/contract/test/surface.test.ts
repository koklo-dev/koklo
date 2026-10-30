import { describe, expect, expectTypeOf, it } from "vitest";
import * as api from "../src/index.ts";
import { contract, generateOpenApi } from "../src/index.ts";

type Doc = {
  paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
  components?: { schemas?: Record<string, unknown> };
};
const doc = async () => (await generateOpenApi()) as Doc;
const statuses = (d: Doc, path: string, method: string) =>
  Object.keys(d.paths[path]?.[method]?.responses ?? {});

const GROUPS: Record<string, string[]> = {
  ticket: ["create", "delete", "get", "list", "transition", "update"],
  dependency: ["add", "list", "remove"],
  sprint: ["activate", "close", "create", "get", "list", "update"],
  comment: ["create", "delete", "list"],
  projectState: ["get", "update"],
  lease: ["acquire", "get", "heartbeat", "release"],
  audit: ["list"],
};

describe("R1 routeur : 7 nouveaux groupes, 25 procédures", () => {
  it("expose health, organization, member, project et les 7 groupes", () => {
    expect(Object.keys(contract).sort()).toEqual(
      [
        "audit",
        "comment",
        "dependency",
        "health",
        "lease",
        "member",
        "organization",
        "project",
        "projectState",
        "sprint",
        "ticket",
      ].sort(),
    );
  });
  it.each(Object.entries(GROUPS))("le groupe %s contient exactement ses procédures", (g, names) => {
    const group = (contract as unknown as Record<string, Record<string, unknown>>)[g] ?? {};
    expect(Object.keys(group).sort()).toEqual(names);
  });
  it("aucune procédure d'écriture de l'audit ni de verrou (lock.*)", () => {
    expect("lock" in contract).toBe(false);
  });
});

describe("R2 OpenAPI : méthode et chemin de chaque nouvelle procédure", () => {
  const PAIRS = [
    "POST /tickets",
    "GET /tickets/{key}",
    "GET /tickets",
    "PATCH /tickets/{key}",
    "DELETE /tickets/{key}",
    "POST /tickets/{key}/transition",
    "POST /tickets/{key}/dependencies",
    "DELETE /tickets/{key}/dependencies/{dependsOn}",
    "GET /tickets/{key}/dependencies",
    "POST /sprints",
    "GET /sprints/{key}",
    "GET /sprints",
    "PATCH /sprints/{key}",
    "POST /sprints/{key}/activate",
    "POST /sprints/{key}/close",
    "POST /comments",
    "GET /comments",
    "DELETE /comments/{id}",
    "GET /project-state",
    "PUT /project-state",
    "POST /tickets/{key}/lease",
    "POST /tickets/{key}/lease/heartbeat",
    "DELETE /tickets/{key}/lease",
    "GET /tickets/{key}/lease",
    "GET /audit",
  ];
  it("les 25 paires de TK-29 sont présentes", async () => {
    const d = await doc();
    const pairs = Object.entries(d.paths).flatMap(([p, ops]) =>
      Object.keys(ops).map((m) => `${m.toUpperCase()} ${p}`),
    );
    for (const pair of PAIRS) expect(pairs, pair).toContain(pair);
    expect(pairs).toHaveLength(8 + PAIRS.length);
  });
});

describe("R3 OpenAPI : réponses d'erreur par route", () => {
  const EXPECTED: [string, string, string[]][] = [
    ["/tickets", "post", ["401", "403", "422", "500"]],
    ["/tickets/{key}", "get", ["401", "404", "500"]],
    ["/tickets", "get", ["401", "500"]],
    ["/tickets/{key}", "patch", ["401", "403", "404", "422", "500"]],
    ["/tickets/{key}", "delete", ["401", "403", "404", "409", "500"]],
    ["/tickets/{key}/transition", "post", ["401", "403", "404", "409", "500"]],
    ["/tickets/{key}/dependencies", "post", ["401", "403", "404", "409", "500"]],
    ["/sprints", "post", ["401", "403", "422", "500"]],
    ["/sprints/{key}/activate", "post", ["401", "403", "404", "409", "500"]],
    ["/project-state", "put", ["401", "403", "409", "500"]],
    ["/tickets/{key}/lease", "post", ["401", "403", "404", "409", "500"]],
    ["/tickets/{key}/lease/heartbeat", "post", ["403", "404", "409", "500"]],
    ["/tickets/{key}/lease", "delete", ["403", "404", "500"]],
    ["/audit", "get", ["401", "403", "500"]],
  ];
  it.each(EXPECTED)("%s %s expose ses réponses", async (path, method, codes) => {
    expect(statuses(await doc(), path, method)).toEqual(expect.arrayContaining(codes));
  });
  it("les lectures ouvertes à tous n'ont pas de 403", async () => {
    const d = await doc();
    expect(statuses(d, "/tickets", "get")).not.toContain("403");
    expect(statuses(d, "/project-state", "get")).not.toContain("403");
  });
});

describe("R4 OpenAPI : composants des erreurs typées", () => {
  it("contient InvalidTransition, DependencyCycle, VersionConflict, LeaseHeld, LeaseExpired, LeaseNotHolder, Validation", async () => {
    const schemas = (await doc()).components?.schemas ?? {};
    for (const name of [
      "InvalidTransition",
      "DependencyCycle",
      "VersionConflict",
      "LeaseHeld",
      "LeaseExpired",
      "LeaseNotHolder",
      "Validation",
    ]) {
      expect(Object.keys(schemas), name).toContain(name);
    }
  });
  it("errorStatusMap couvre les nouveaux codes", () => {
    const map = api.errorStatusMap as Record<string, number>;
    expect(map.INVALID_TRANSITION).toBe(409);
    expect(map.DEPENDENCY_CYCLE).toBe(409);
    expect(map.VERSION_CONFLICT).toBe(409);
    expect(map.LEASE_HELD).toBe(409);
    expect(map.LEASE_EXPIRED).toBe(409);
    expect(map.LEASE_NOT_HOLDER).toBe(403);
    expect(map.VALIDATION).toBe(422);
  });
});

describe("R5 index : schémas et types exportés", () => {
  it("ré-exporte les schémas de l'index", () => {
    for (const name of [
      "ticketSchema",
      "ticketDetailSchema",
      "ticketStatusSchema",
      "ticketKeySchema",
      "sprintSchema",
      "dependencySchema",
      "commentSchema",
      "projectStateSchema",
      "leaseSchema",
      "auditEntrySchema",
      "ticketPackageSchema",
      "sensitivitySchema",
      "dependencyTypeSchema",
    ]) {
      expect((api as Record<string, unknown>)[name], name).toBeDefined();
    }
  });
  it("types d'entrée, de sortie et d'énumération", () => {
    expectTypeOf<api.TicketCreateInput>().toHaveProperty("title");
    expectTypeOf<api.TicketTransitionInput>().toEqualTypeOf<{
      key: string;
      to: api.TicketStatus;
    }>();
    expectTypeOf<api.TicketOutput>().toHaveProperty("key");
    expectTypeOf<api.DependencyAddInput>().toHaveProperty("dependsOn");
    expectTypeOf<api.SprintCreateInput>().toHaveProperty("goal");
    expectTypeOf<api.CommentCreateInput>().toHaveProperty("body");
    expectTypeOf<api.ProjectStateUpdateInput>().toHaveProperty("expectedVersion");
    expectTypeOf<api.LeaseAcquireInput>().toHaveProperty("worktree");
    expectTypeOf<api.AuditEntry>().toHaveProperty("occurredAt");
    expectTypeOf<api.TicketStatus>().toEqualTypeOf<
      "backlog" | "todo" | "in_progress" | "in_review" | "blocked" | "done" | "cancelled"
    >();
  });
});
