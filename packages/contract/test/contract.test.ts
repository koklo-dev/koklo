import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  contract,
  generateOpenApi,
  type HealthInput,
  type HealthOutput,
  type ProjectListOutput,
} from "../src/index.ts";

const root = resolve(import.meta.dirname, "..");
const readJson = (rel: string) => JSON.parse(readFileSync(resolve(root, rel), "utf8"));

type Validatable = {
  "~orpc": {
    inputSchemas?: StandardLike[];
    outputSchemas?: StandardLike[];
    errorMap?: Record<string, { status?: number; data?: StandardLike }>;
  };
};
type StandardLike = {
  "~standard": { validate(v: unknown): unknown | Promise<unknown> };
};

const procedures = (): Record<string, Validatable> => ({
  health: (contract as unknown as Record<string, Validatable>).health as Validatable,
  "project.list": (contract as unknown as { project: Record<string, Validatable> }).project
    .list as Validatable,
});

const isValid = async (schema: StandardLike | undefined, value: unknown) => {
  if (!schema) throw new Error("schema manquant");
  const r = (await schema["~standard"].validate(value)) as { issues?: unknown[] };
  return r.issues === undefined;
};

const canonical = (v: unknown): string => JSON.stringify(sortKeys(v));
const sortKeys = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(sortKeys)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>)
            .sort(([a], [b]) => (a < b ? -1 : 1))
            .map(([k, x]) => [k, sortKeys(x)]),
        )
      : v;

const UUID = "123e4567-e89b-42d3-a456-426614174000";

describe("CT-2 contrat health", () => {
  it("expose health, entrée vide, sortie { status: ok, version }", async () => {
    const { health } = procedures();
    expect(health).toBeDefined();
    expect(await isValid(health?.["~orpc"].inputSchemas?.[0], {})).toBe(true);
    const out = health?.["~orpc"].outputSchemas?.[0];
    expect(await isValid(out, { status: "ok", version: "1.2.3" })).toBe(true);
    expect(await isValid(out, { status: "down", version: "1.2.3" })).toBe(false);
    expect(await isValid(out, { status: "ok" })).toBe(false);
  });
});

describe("CT-3 contrat project.list", () => {
  it("sortie : tableau d'objets { id, key, name }", async () => {
    const list = procedures()["project.list"];
    expect(list).toBeDefined();
    const out = list?.["~orpc"].outputSchemas?.[0];
    expect(await isValid(out, [])).toBe(true);
    expect(await isValid(out, [{ id: UUID, key: "KOK", name: "Koklo" }])).toBe(true);
    expect(await isValid(out, [{ key: "KOK", name: "Koklo" }])).toBe(false);
    expect(await isValid(out, [{ id: UUID, key: "KOK" }])).toBe(false);
  });
});

describe("CT-4 chemins explicites", () => {
  it("chaque route a méthode + chemin déclarés, sans doublon", async () => {
    const doc = (await generateOpenApi()) as { paths: Record<string, Record<string, unknown>> };
    const pairs = Object.entries(doc.paths).flatMap(([path, ops]) =>
      Object.keys(ops).map((method) => `${method.toUpperCase()} ${path}`),
    );
    expect(pairs).toHaveLength(Object.keys(procedures()).length);
    expect(new Set(pairs).size).toBe(pairs.length);
    expect(pairs.sort()).toEqual(["GET /health", "GET /projects"]);
  });
});

describe("CT-5 erreurs typées", () => {
  it("déclare INTERNAL, UNAUTHORIZED, FORBIDDEN avec statut et data Zod", () => {
    const { health, "project.list": list } = procedures();
    const h = health?.["~orpc"].errorMap ?? {};
    const l = list?.["~orpc"].errorMap ?? {};
    expect(h.INTERNAL?.status).toBe(500);
    expect(h.INTERNAL?.data).toBeDefined();
    expect(l.INTERNAL?.status).toBe(500);
    expect(l.UNAUTHORIZED?.status).toBe(401);
    expect(l.FORBIDDEN?.status).toBe(403);
    expect(h.UNAUTHORIZED).toBeUndefined();
  });

  it("INTERNAL exige un requestId", async () => {
    const data = procedures().health?.["~orpc"].errorMap?.INTERNAL?.data;
    expect(await isValid(data, { requestId: "req-1" })).toBe(true);
    expect(await isValid(data, {})).toBe(false);
  });

  it("l'OpenAPI généré contient les réponses 401, 403, 500", async () => {
    const doc = (await generateOpenApi()) as {
      paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
      components?: { schemas?: Record<string, unknown> };
    };
    const list = doc.paths["/projects"]?.get?.responses ?? {};
    const health = doc.paths["/health"]?.get?.responses ?? {};
    expect(Object.keys(list)).toEqual(expect.arrayContaining(["401", "403", "500"]));
    expect(Object.keys(health)).toContain("500");
    expect(Object.keys(health)).not.toContain("401");
    expect(JSON.stringify(list["500"])).toContain("#/components/schemas/Internal");
    expect(JSON.stringify(doc.components?.schemas?.Internal)).toContain("requestId");
  });
});

describe("CT-6 génération OpenAPI", () => {
  it("produit un document OpenAPI 3.x avec /health et /projects", async () => {
    const doc = (await generateOpenApi()) as {
      openapi: string;
      info: { title: string; version: string };
      paths: Record<string, unknown>;
    };
    expect(doc.openapi).toMatch(/^3\./);
    expect(doc.info.title).toBeTruthy();
    expect(Object.keys(doc.paths).sort()).toEqual(["/health", "/projects"]);
    expect(JSON.stringify(doc)).toContain('"status"');
  });

  it("est déterministe et trié, octet pour octet", async () => {
    const a = canonical(await generateOpenApi());
    const b = canonical(await generateOpenApi());
    expect(a).toBe(b);
    expect(canonical(await generateOpenApi())).toBe(canonical(sortKeys(await generateOpenApi())));
  });
});

describe("CT-7 stabilité de l'OpenAPI", () => {
  it("le document généré égale openapi/openapi.json", async () => {
    expect(JSON.parse(canonical(await generateOpenApi()))).toEqual(
      readJson("openapi/openapi.json"),
    );
  });

  it("info.version du fichier égale la version de package.json", async () => {
    const pkg = readJson("package.json");
    expect(readJson("openapi/openapi.json").info.version).toBe(pkg.version);
    const doc = (await generateOpenApi()) as { info: { version: string } };
    expect(doc.info.version).toBe(pkg.version);
  });
});

describe("CT-8 lien version et contenu", () => {
  it("versions.json contient la version courante avec la bonne empreinte sha256", async () => {
    const { version } = readJson("package.json");
    const versions = readJson("openapi/versions.json") as Record<string, string>;
    expect(versions[version]).toBeDefined();
    const hash = createHash("sha256")
      .update(canonical(await generateOpenApi()))
      .digest("hex");
    expect(versions[version]).toBe(hash);
  });
});

describe("CT-9 exports", () => {
  it("exporte contrat, generateOpenApi et types inférés depuis l'index", () => {
    expect(typeof generateOpenApi).toBe("function");
    expect(contract).toBeDefined();
    expectTypeOf<HealthInput>().toBeObject();
    expectTypeOf<HealthOutput>().toEqualTypeOf<{ status: "ok"; version: string }>();
    expectTypeOf<ProjectListOutput>().toBeArray();
    expectTypeOf<ProjectListOutput[number]>().toHaveProperty("name");
  });
});
