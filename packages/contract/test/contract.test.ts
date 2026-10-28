import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  CONTRACT_VERSION,
  contract,
  generateOpenApi,
  type HealthInput,
  type HealthOutput,
  type ProjectListOutput,
} from "../src/index.ts";
import { projectSchema } from "../src/schemas.ts";
import { hashDocument, recordVersion } from "../src/versions.ts";

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
  it("sortie : tableau d'objets { id, name }, sans key (TK-10 D1)", async () => {
    const list = procedures()["project.list"];
    expect(list).toBeDefined();
    const out = list?.["~orpc"].outputSchemas?.[0];
    expect(await isValid(out, [])).toBe(true);
    expect(await isValid(out, [{ id: UUID, name: "Koklo" }])).toBe(true);
    expect(await isValid(out, [{ name: "Koklo" }])).toBe(false);
    expect(await isValid(out, [{ id: UUID }])).toBe(false);
    expect(Object.keys(projectSchema.shape).sort()).toEqual(["id", "name"]);
  });
});

describe("CT-4 chemins explicites", () => {
  it("chaque route a méthode + chemin déclarés, sans doublon", async () => {
    const doc = (await generateOpenApi()) as { paths: Record<string, Record<string, unknown>> };
    const pairs = Object.entries(doc.paths).flatMap(([path, ops]) =>
      Object.keys(ops).map((method) => `${method.toUpperCase()} ${path}`),
    );
    expect(pairs).toHaveLength(8);
    expect(new Set(pairs).size).toBe(pairs.length);
    expect(pairs.sort()).toEqual([
      "GET /health",
      "GET /members",
      "GET /organizations",
      "GET /projects",
      "PATCH /members/{memberId}/role",
      "POST /members/invitations",
      "POST /organizations",
      "POST /projects",
    ]);
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
  it("produit un document OpenAPI 3.x avec les 6 chemins (8 routes)", async () => {
    const doc = (await generateOpenApi()) as {
      openapi: string;
      info: { title: string; version: string };
      paths: Record<string, unknown>;
    };
    expect(doc.openapi).toMatch(/^3\./);
    expect(doc.info.title).toBeTruthy();
    expect(Object.keys(doc.paths).sort()).toEqual([
      "/health",
      "/members",
      "/members/invitations",
      "/members/{memberId}/role",
      "/organizations",
      "/projects",
    ]);
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

describe("CT-8b garde de version", () => {
  const doc = { openapi: "3.1.0", paths: {} };

  it("enregistre une nouvelle version et conserve les anciennes", () => {
    expect(recordVersion({ "0.0.1": "abc" }, "0.1.0", doc)).toEqual({
      "0.0.1": "abc",
      "0.1.0": hashDocument(doc),
    });
  });

  it("accepte de rejouer la même version avec le même document", () => {
    const versions = { "0.1.0": hashDocument(doc) };
    expect(recordVersion(versions, "0.1.0", doc)).toEqual(versions);
  });

  it("échoue si le document change sans changement de version", () => {
    const versions = { "0.1.0": hashDocument(doc) };
    expect(() => recordVersion(versions, "0.1.0", { ...doc, paths: { "/x": {} } })).toThrow(
      /sans changement de version/,
    );
  });

  it("accepte l'état committé : versions.json est cohérent avec le contrat actuel", async () => {
    const { version } = readJson("package.json");
    const versions = readJson("openapi/versions.json") as Record<string, string>;
    const document = await generateOpenApi();
    expect(() => recordVersion(versions, version, document)).not.toThrow();
  });
});

describe("CT-10 version du contrat (TK-21)", () => {
  it("est en 0.3.0 : package.json, CONTRACT_VERSION et versions.json alignés", () => {
    expect(readJson("package.json").version).toBe("0.3.0");
    expect(CONTRACT_VERSION).toBe("0.3.0");
    expect(Object.keys(readJson("openapi/versions.json"))).toEqual(["0.1.0", "0.2.0", "0.3.0"]);
  });

  it("conserve les empreintes des versions précédentes (versions.json ne fait que croître)", () => {
    const versions = readJson("openapi/versions.json") as Record<string, string>;
    expect(versions["0.1.0"]).toBe(
      "0298d7165e28361bd41e002829956c2e1dcdea6e0f40a6cf539b78e9039b4738",
    );
    expect(versions["0.2.0"]).toBe(
      "9187ec3eae09e5a6dd39091f417b5fe55b5f72ea22a71f29066455b5261ab779",
    );
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
