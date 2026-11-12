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
import { ALL_PAIRS, ALL_PATHS } from "./paths.ts";

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
    expect(pairs).toHaveLength(126);
    expect(new Set(pairs).size).toBe(pairs.length);
    expect(pairs.sort()).toEqual(ALL_PAIRS);
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
  it("produit un document OpenAPI 3.x avec les 100 chemins (126 routes)", async () => {
    const doc = (await generateOpenApi()) as {
      openapi: string;
      info: { title: string; version: string };
      paths: Record<string, unknown>;
    };
    expect(doc.openapi).toMatch(/^3\./);
    expect(doc.info.title).toBeTruthy();
    expect(Object.keys(doc.paths).sort()).toEqual(ALL_PATHS);
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

describe("CT-10 version du contrat (TK-42, TK-45c2, TK-48a2, TK-52b, TK-54b, TK-55a, TK-55b, TK-55c, TK-55d, TK-55, TK-94, TK-95, TK-96, TK-88, TK-97, TK-98, TK-89, TK-90, TK-91, TK-92, TK-93, TK-99a, TK-100)", () => {
  it("est en 2.10.0 : package.json, CONTRACT_VERSION et versions.json alignés", () => {
    expect(readJson("package.json").version).toBe("2.10.0");
    expect(CONTRACT_VERSION).toBe("2.10.0");
    expect(Object.keys(readJson("openapi/versions.json"))).toEqual([
      "0.1.0",
      "0.2.0",
      "0.3.0",
      "0.4.0",
      "0.5.0",
      "0.6.0",
      "0.7.0",
      "0.8.0",
      "0.9.0",
      "0.10.0",
      "0.11.0",
      "0.12.0",
      "0.13.0",
      "0.14.0",
      "1.0.0",
      "1.1.0",
      "2.0.0",
      "2.1.0",
      "2.2.0",
      "2.3.0",
      "2.4.0",
      "2.5.0",
      "2.6.0",
      "2.7.0",
      "2.8.0",
      "2.8.1",
      "2.9.0",
      "2.10.0",
    ]);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe("CT-10b empreintes figées des versions publiées", () => {
  it("conserve les empreintes des versions précédentes (versions.json ne fait que croître)", () => {
    const versions = readJson("openapi/versions.json") as Record<string, string>;
    expect(versions["0.1.0"]).toBe(
      "0298d7165e28361bd41e002829956c2e1dcdea6e0f40a6cf539b78e9039b4738",
    );
    expect(versions["0.2.0"]).toBe(
      "9187ec3eae09e5a6dd39091f417b5fe55b5f72ea22a71f29066455b5261ab779",
    );
    expect(versions["0.3.0"]).toBe(
      "d16fb0eec65a6efef88a8d35c8ce69a7aa160efe7c606e1246b4b2ca79f3f869",
    );
    expect(versions["0.4.0"]).toBe(
      "95f7d6490d2965f3d33c042624e2c6a9ed3d22fb55c9aeb17dbe68c76e2a2828",
    );
    expect(versions["0.5.0"]).toBe(
      "f08da34aca79dbf58d5b4833f19f8f9c6818bc59685692b558fda459f51817af",
    );
  });

  it("conserve l'empreinte figée de 0.6.0 (TK-45c2)", () => {
    const versions = readJson("openapi/versions.json") as Record<string, string>;
    expect(versions["0.6.0"]).toBe(
      "5dbb28ba6f41cfbb31409d8303ad2d12405ffcb0a79e4e166a99dee01e198569",
    );
  });

  it("conserve l'empreinte figée de 0.7.0 (TK-48a2)", () => {
    const versions = readJson("openapi/versions.json") as Record<string, string>;
    expect(versions["0.7.0"]).toBe(
      "380f11e2d65db495f12459c1fefbd5612240689a1705cf36f06f681902d2d3a8",
    );
  });

  it("conserve l'empreinte figée de 0.8.0 (TK-52b) : elle ne suit plus le document courant", () => {
    const versions = readJson("openapi/versions.json") as Record<string, string>;
    expect(versions["0.8.0"]).toBe(
      "9ba431bca4400ca0e188f420012e381976982d24861843d71a56155af326ed9b",
    );
    expect(versions["0.8.0"]).not.toBe(versions["0.7.0"]);
  });

  it("conserve l'empreinte figée de 0.10.0 (TK-55a) : elle ne suit plus le document courant", () => {
    const versions = readJson("openapi/versions.json") as Record<string, string>;
    expect(versions["0.10.0"]).toBe(
      "e3e6e4301f184f1a58145c71af14837a9b3170c0d9d4186986523a852591a843",
    );
  });

  it("conserve l'empreinte figée de 0.11.0 (TK-55b) : elle ne suit plus le document courant", () => {
    const versions = readJson("openapi/versions.json") as Record<string, string>;
    expect(versions["0.11.0"]).toBe(
      "4cc3e1a3e3ec382fb15777d2c3cf496ca013674f41b849e7f58b4268502bf658",
    );
  });

  it("conserve l'empreinte figée de 0.12.0 (TK-55c) : elle ne suit plus le document courant", () => {
    const versions = readJson("openapi/versions.json") as Record<string, string>;
    expect(versions["0.12.0"]).toBe(
      "60f6308017af5730a9a146a4eebd927fee867b33a21d0fbcfe73d4f121165b23",
    );
  });

  it("conserve l'empreinte figée de 0.13.0 (TK-55d) : elle ne suit plus le document courant", () => {
    const versions = readJson("openapi/versions.json") as Record<string, string>;
    expect(versions["0.13.0"]).toBe(
      "7e27df39514a0ff7b44417fe1252b90717457b0ccd07223edeaca6b4731d1c76",
    );
  });

  it("conserve l'empreinte figée de 0.14.0 (TK-55) : elle ne suit plus le document courant", () => {
    const versions = readJson("openapi/versions.json") as Record<string, string>;
    expect(versions["0.14.0"]).toBe(
      "804e8e63c2d69194d0482c99e9d4eaca05ff53445f70b80fe36794adbebcfce6",
    );
  });

  it("conserve l'empreinte figée de 1.0.0 (TK-94) : elle ne suit plus le document courant", () => {
    const versions = readJson("openapi/versions.json") as Record<string, string>;
    expect(versions["1.0.0"]).toBe(
      "48eb94cde4a122de26da0da96390fe5eb9e6de4fb7b8d30ed7fbfd3f2a0ef9e5",
    );
    expect(versions["1.0.0"]).not.toBe(versions["0.14.0"]);
  });

  it("conserve l'empreinte figée de 1.1.0 (TK-95) : elle ne suit plus le document courant", () => {
    const versions = readJson("openapi/versions.json") as Record<string, string>;
    expect(versions["1.1.0"]).toBe(
      "824dd8d58ed16e915fe55ef1694f22e2895de02ea24e28172d44f653b01d516b",
    );
    expect(versions["1.1.0"]).not.toBe(versions["1.0.0"]);
  });

  it("conserve l'empreinte figée de 2.0.0 (projet explicite, TK-96) : elle ne suit plus le document courant", () => {
    const versions = readJson("openapi/versions.json") as Record<string, string>;
    expect(versions["2.0.0"]).toBe(
      "a6b132a523225aa246ffa00f246fc804ee49cc2f6c4dabc9ca0f34fa917e4c9e",
    );
    expect(versions["2.0.0"]).not.toBe(versions["1.1.0"]);
  });

  it("conserve l'empreinte figée de 2.1.0 (coquille, TK-88) : elle ne suit plus le document courant", () => {
    const versions = readJson("openapi/versions.json") as Record<string, string>;
    expect(versions["2.1.0"]).toBe(
      "aafeba4f2e9d1503ba832c963352da5514485c56bada27b1a3de08db89dce21a",
    );
    expect(versions["2.1.0"]).not.toBe(versions["2.0.0"]);
  });

  it("conserve l'empreinte figée de 2.2.0 (réglages, TK-97) : elle ne suit plus le document courant", () => {
    const versions = readJson("openapi/versions.json") as Record<string, string>;
    expect(versions["2.2.0"]).toBe(
      "d79dcac90486dca5deaa9043e7a31f217cd50c290d4ba8e8d300656b6bd50110",
    );
    expect(versions["2.2.0"]).not.toBe(versions["2.1.0"]);
  });

  it("conserve l'empreinte figée de 2.3.0 (fournisseurs d'IA, TK-98) : elle ne suit plus le document courant", () => {
    const versions = readJson("openapi/versions.json") as Record<string, string>;
    expect(versions["2.3.0"]).toBe(
      "520610a1a98f6c30b9542013f91f0d0ea04b7786a5a6e16fdeca3380a453cb9d",
    );
    expect(versions["2.3.0"]).not.toBe(versions["2.2.0"]);
  });

  it("conserve l'empreinte figée de 2.4.0 (espace Idée, TK-89) : elle ne suit plus le document courant", () => {
    const versions = readJson("openapi/versions.json") as Record<string, string>;
    expect(versions["2.4.0"]).toBe(
      "2aaf9130febff8f39e9858380e9a2673c33a08e0304fde3fb9d213f2cd1f8309",
    );
    expect(versions["2.4.0"]).not.toBe(versions["2.3.0"]);
  });

  it("conserve l'empreinte figée de 2.5.0 (agent de l'espace Idée, TK-90) : elle ne suit plus le document courant", () => {
    const versions = readJson("openapi/versions.json") as Record<string, string>;
    expect(versions["2.5.0"]).toBe(
      "c73736f78d6e66be3d2518555db532aa90ea8bf57dc2817de1a9cce3b4120a90",
    );
    expect(versions["2.5.0"]).not.toBe(versions["2.4.0"]);
  });

  it("conserve l'empreinte figée de 2.6.0 (maturité, Synthèse, idea-vN, TK-91) : elle ne suit plus le document courant", () => {
    const versions = readJson("openapi/versions.json") as Record<string, string>;
    expect(versions["2.6.0"]).toBe(
      "5e6daedf79072465179010dbdeec17efd688e32abe3d988a22a7644270b8cd39",
    );
    expect(versions["2.6.0"]).not.toBe(versions["2.5.0"]);
  });

  it("conserve l'empreinte figée de 2.7.0 (vue d'ensemble, TK-92) : elle ne suit plus le document courant", () => {
    const versions = readJson("openapi/versions.json") as Record<string, string>;
    expect(versions["2.7.0"]).toBe(
      "590d35e31eb82eecaa41eb5d586eae225ac5032172e2a3d52dd881ea220a63ec",
    );
    expect(versions["2.7.0"]).not.toBe(versions["2.6.0"]);
  });

  it("conserve l'empreinte figée de 2.8.0 (cartes de projets, TK-93) : elle ne suit plus le document courant", () => {
    const versions = readJson("openapi/versions.json") as Record<string, string>;
    expect(versions["2.8.0"]).toBe(
      "ee7c58d839a8bfd6923434499c2410058f5debd4d1c333c8c0bd46f15268b177",
    );
    expect(versions["2.8.0"]).not.toBe(versions["2.7.0"]);
  });

  it("conserve l'empreinte figée de 2.8.1 (oRPC beta.48 : corps PATCH sprint et ticket en additionalProperties false) : elle ne suit plus le document courant", () => {
    const versions = readJson("openapi/versions.json") as Record<string, string>;
    expect(versions["2.8.1"]).toBe(
      "bc702c01bbafb88216fecbe505496f0290e581342b07c00b15caeb9720c7d756",
    );
    expect(versions["2.8.1"]).not.toBe(versions["2.8.0"]);
  });

  it("conserve l'empreinte figée de 2.9.0 (propositions de l'agent, TK-99a) : elle ne suit plus le document courant", () => {
    const versions = readJson("openapi/versions.json") as Record<string, string>;
    expect(versions["2.9.0"]).toBe(
      "cba7ecc6ff2b72e38ebe04eff8e717812c6b35996703269aef92832ab5eed753",
    );
    expect(versions["2.9.0"]).not.toBe(versions["2.8.0"]);
  });

  it("l'empreinte 2.10.0 est celle du document généré et diffère de 2.9.0 (livrables de la spec, TK-100)", async () => {
    const versions = readJson("openapi/versions.json") as Record<string, string>;
    const hash = createHash("sha256")
      .update(canonical(await generateOpenApi()))
      .digest("hex");
    expect(versions["2.10.0"]).toBe(hash);
    expect(versions["2.10.0"]).not.toBe(versions["2.9.0"]);
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
