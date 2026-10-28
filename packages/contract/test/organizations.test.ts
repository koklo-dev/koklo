import { describe, expect, expectTypeOf, it } from "vitest";
import {
  contract,
  generateOpenApi,
  type MemberInviteInput,
  type MemberRole,
  type OrganizationCreateInput,
  type ProjectCreateInput,
  type Role,
} from "../src/index.ts";
import * as schemas from "../src/schemas.ts";

type StandardLike = {
  "~standard": { validate(v: unknown): unknown | Promise<unknown> };
};
type Procedure = {
  "~orpc": {
    inputSchemas?: StandardLike[];
    outputSchemas?: StandardLike[];
    errorMap?: Record<string, { status?: number; data?: StandardLike }>;
  };
};

const c = contract as unknown as {
  organization: Record<string, Procedure>;
  member: Record<string, Procedure>;
  project: Record<string, Procedure>;
};
const proc = {
  "organization.create": () => c.organization?.create,
  "organization.list": () => c.organization?.list,
  "member.invite": () => c.member?.invite,
  "member.list": () => c.member?.list,
  "member.setRole": () => c.member?.setRole,
  "project.create": () => c.project?.create,
};

const isValid = async (schema: StandardLike | undefined, value: unknown) => {
  if (!schema) throw new Error("schema manquant");
  const r = (await schema["~standard"].validate(value)) as { issues?: unknown[] };
  return r.issues === undefined;
};
const input = (p: Procedure | undefined) => p?.["~orpc"].inputSchemas?.[0];
const output = (p: Procedure | undefined) => p?.["~orpc"].outputSchemas?.[0];
const errors = (p: Procedure | undefined) => p?.["~orpc"].errorMap ?? {};

const UUID = "123e4567-e89b-42d3-a456-426614174000";
const EXPIRES = "2026-11-04T10:00:00.000Z";
const ROLES = ["owner", "admin", "dev", "designer", "client", "business"];
const ASSIGNABLE = ["admin", "dev", "designer", "client", "business"];

describe("C0 les 6 procédures sont déclarées", () => {
  it.each(Object.keys(proc))("%s existe", (name) => {
    expect(proc[name as keyof typeof proc]()).toBeDefined();
  });
});

describe("C1 rôles du CDC §14", () => {
  it("roleSchema liste les 6 rôles, memberRoleSchema exclut owner", async () => {
    for (const r of ROLES) expect(await isValid(schemas.roleSchema, r)).toBe(true);
    expect(await isValid(schemas.roleSchema, "root")).toBe(false);
    for (const r of ASSIGNABLE) expect(await isValid(schemas.memberRoleSchema, r)).toBe(true);
    expect(await isValid(schemas.memberRoleSchema, "owner")).toBe(false);
  });
});

describe("C1 organization.create", () => {
  const i = () => input(proc["organization.create"]());
  it("accepte un nom, avec ou sans slug", async () => {
    expect(await isValid(i(), { name: "Acme" })).toBe(true);
    expect(await isValid(i(), { name: "Acme", slug: "acme-2" })).toBe(true);
    expect(await isValid(i(), { name: "a".repeat(100), slug: "ab" })).toBe(true);
  });
  it("rejette nom vide ou trop long, slug invalide", async () => {
    expect(await isValid(i(), {})).toBe(false);
    expect(await isValid(i(), { name: "" })).toBe(false);
    expect(await isValid(i(), { name: "a".repeat(101) })).toBe(false);
    for (const slug of ["a", "A-B", "a b", "a_b", "é-é", "a".repeat(49)]) {
      expect(await isValid(i(), { name: "Acme", slug })).toBe(false);
    }
  });
  it("sortie { id, name, slug }", async () => {
    const o = output(proc["organization.create"]());
    expect(await isValid(o, { id: UUID, name: "Acme", slug: "acme" })).toBe(true);
    expect(await isValid(o, { id: "x", name: "Acme", slug: "acme" })).toBe(false);
    expect(await isValid(o, { id: UUID, name: "Acme" })).toBe(false);
  });
});

describe("C1 organization.list", () => {
  it("sortie : tableau { id, name, slug, role }", async () => {
    const o = output(proc["organization.list"]());
    expect(await isValid(o, [])).toBe(true);
    expect(await isValid(o, [{ id: UUID, name: "Acme", slug: "acme", role: "owner" }])).toBe(true);
    expect(await isValid(o, [{ id: UUID, name: "Acme", slug: "acme" }])).toBe(false);
    expect(await isValid(o, [{ id: UUID, name: "Acme", slug: "acme", role: "root" }])).toBe(false);
  });
});

describe("C1 member.invite", () => {
  const i = () => input(proc["member.invite"]());
  it("accepte email valide et rôle attribuable", async () => {
    for (const role of ASSIGNABLE) {
      expect(await isValid(i(), { email: "a@b.co", role })).toBe(true);
    }
  });
  it("rejette email invalide, rôle hors enum et rôle owner", async () => {
    expect(await isValid(i(), { email: "pas-un-email", role: "dev" })).toBe(false);
    expect(await isValid(i(), { role: "dev" })).toBe(false);
    expect(await isValid(i(), { email: "a@b.co", role: "root" })).toBe(false);
    expect(await isValid(i(), { email: "a@b.co", role: "owner" })).toBe(false);
    expect(await isValid(i(), { email: "a@b.co" })).toBe(false);
  });
  it("sortie { id, email, role, status: pending, expiresAt }", async () => {
    const o = output(proc["member.invite"]());
    const ok = { id: UUID, email: "a@b.co", role: "dev", status: "pending", expiresAt: EXPIRES };
    expect(await isValid(o, ok)).toBe(true);
    expect(await isValid(o, { ...ok, status: "accepted" })).toBe(false);
    expect(await isValid(o, { ...ok, expiresAt: "demain" })).toBe(false);
    expect(await isValid(o, { ...ok, role: "owner" })).toBe(false);
  });
});

describe("C1 member.list", () => {
  it("sortie : tableau { id, userId, name, email, role }", async () => {
    const o = output(proc["member.list"]());
    const m = { id: UUID, userId: UUID, name: "Ada", email: "ada@b.co", role: "owner" };
    expect(await isValid(o, [])).toBe(true);
    expect(await isValid(o, [m])).toBe(true);
    expect(await isValid(o, [{ ...m, email: "x" }])).toBe(false);
    expect(await isValid(o, [{ ...m, userId: undefined }])).toBe(false);
    expect(await isValid(o, [{ ...m, role: "root" }])).toBe(false);
  });
});

describe("C1 member.setRole", () => {
  const i = () => input(proc["member.setRole"]());
  it("accepte memberId uuid et rôle attribuable", async () => {
    expect(await isValid(i(), { memberId: UUID, role: "designer" })).toBe(true);
  });
  it("rejette memberId non uuid, rôle hors enum ou owner", async () => {
    expect(await isValid(i(), { memberId: "42", role: "dev" })).toBe(false);
    expect(await isValid(i(), { memberId: UUID, role: "root" })).toBe(false);
    expect(await isValid(i(), { memberId: UUID, role: "owner" })).toBe(false);
    expect(await isValid(i(), { role: "dev" })).toBe(false);
  });
  it("sortie { id, role }", async () => {
    const o = output(proc["member.setRole"]());
    expect(await isValid(o, { id: UUID, role: "client" })).toBe(true);
    expect(await isValid(o, { id: UUID })).toBe(false);
    expect(await isValid(o, { id: UUID, role: "root" })).toBe(false);
  });
});

describe("C1 project.create", () => {
  const i = () => input(proc["project.create"]());
  it("accepte un nom de 1 à 100 caractères", async () => {
    expect(await isValid(i(), { name: "Koklo" })).toBe(true);
    expect(await isValid(i(), { name: "a".repeat(100) })).toBe(true);
  });
  it("rejette nom absent, vide ou trop long", async () => {
    expect(await isValid(i(), {})).toBe(false);
    expect(await isValid(i(), { name: "" })).toBe(false);
    expect(await isValid(i(), { name: "a".repeat(101) })).toBe(false);
  });
  it("sortie : même projectSchema { id, name }", async () => {
    const o = output(proc["project.create"]());
    expect(await isValid(o, { id: UUID, name: "Koklo" })).toBe(true);
    expect(await isValid(o, { name: "Koklo" })).toBe(false);
  });
});

describe("C3 erreurs typées par route", () => {
  const expected: Record<string, Record<string, number>> = {
    "organization.create": { INTERNAL: 500, UNAUTHORIZED: 401, CONFLICT: 409 },
    "organization.list": { INTERNAL: 500, UNAUTHORIZED: 401 },
    "member.invite": { INTERNAL: 500, UNAUTHORIZED: 401, FORBIDDEN: 403, CONFLICT: 409 },
    "member.list": { INTERNAL: 500, UNAUTHORIZED: 401 },
    "member.setRole": {
      INTERNAL: 500,
      UNAUTHORIZED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      CONFLICT: 409,
    },
    "project.create": { INTERNAL: 500, UNAUTHORIZED: 401, FORBIDDEN: 403 },
  };
  it.each(Object.entries(expected))("%s expose ses statuts", (name, statuses) => {
    const map = errors(proc[name as keyof typeof proc]());
    for (const [code, status] of Object.entries(statuses)) {
      expect(map[code]?.status, `${name} ${code}`).toBe(status);
    }
  });
  it("n'expose pas les erreurs hors de ses routes", () => {
    expect(errors(proc["organization.create"]()).FORBIDDEN).toBeUndefined();
    expect(errors(proc["project.create"]()).CONFLICT).toBeUndefined();
    expect(errors(proc["member.invite"]()).NOT_FOUND).toBeUndefined();
    expect(errors(proc["member.list"]()).CONFLICT).toBeUndefined();
  });
  it("CONFLICT.data.reason est borné à l'enum", async () => {
    const data = errors(proc["member.setRole"]()).CONFLICT?.data;
    for (const reason of ["slug_taken", "already_member", "already_invited", "last_owner"]) {
      expect(await isValid(data, { reason })).toBe(true);
    }
    expect(await isValid(data, { reason: "autre" })).toBe(false);
    expect(await isValid(data, {})).toBe(false);
  });
  it("les erreurs partagées sont exportées", async () => {
    const { conflictError, notFoundError } = await import("../src/index.ts");
    expect(conflictError.CONFLICT.status).toBe(409);
    expect(notFoundError.NOT_FOUND.status).toBe(404);
  });
});

describe("C2 routes HTTP et OpenAPI", () => {
  it("expose chaque méthode + chemin et les réponses d'erreur", async () => {
    const doc = (await generateOpenApi()) as {
      paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
    };
    const r = (path: string, method: string) =>
      Object.keys(doc.paths[path]?.[method]?.responses ?? {});
    expect(r("/organizations", "post")).toEqual(expect.arrayContaining(["401", "409", "500"]));
    expect(r("/organizations", "get")).toEqual(expect.arrayContaining(["401", "500"]));
    expect(r("/members/invitations", "post")).toEqual(
      expect.arrayContaining(["401", "403", "409", "500"]),
    );
    expect(r("/members", "get")).toEqual(expect.arrayContaining(["401", "500"]));
    expect(r("/members/{memberId}/role", "patch")).toEqual(
      expect.arrayContaining(["401", "403", "404", "409", "500"]),
    );
    expect(r("/projects", "post")).toEqual(expect.arrayContaining(["401", "403", "500"]));
    expect(r("/health", "get")).not.toContain("401");
  });
});

describe("C6 types exportés", () => {
  it("expose les types d'entrée et de rôle", () => {
    expectTypeOf<OrganizationCreateInput>().toHaveProperty("name");
    expectTypeOf<MemberInviteInput>().toHaveProperty("email");
    expectTypeOf<ProjectCreateInput>().toEqualTypeOf<{ name: string }>();
    expectTypeOf<MemberRole>().toEqualTypeOf<
      "admin" | "dev" | "designer" | "client" | "business"
    >();
    expectTypeOf<Role>().toEqualTypeOf<
      "owner" | "admin" | "dev" | "designer" | "client" | "business"
    >();
  });
});
