import { describe, expect, it } from "vitest";
import * as api from "../src/index.ts";
import { generateOpenApi } from "../src/index.ts";
import { errors, input, isValid, output, parsed, proc, SHA, UUID } from "./support.ts";
import { leaksOf, vocabularyOf } from "./vocabulary.ts";

/**
 * TK-55b (contrat 0.11.0) : groupe `clientSpace` (lectures de l'espace client). Trois procédures,
 * ouvertes aux six rôles (le cloisonnement par projet est côté API). Vocabulaire métier seulement :
 * le jeton `version` est opaque, aucune clé ni valeur d'énumération ne parle de git.
 */
const NAMES = ["feature", "features", "projects"];
const PROJECT = { id: UUID, name: "Refonte du site", phase: "framing" };
const SUMMARY = {
  id: "F-001",
  title: "Connexion",
  priority: "must",
  criteriaCount: 2,
  validation: "to_validate",
  previouslyValidated: false,
  openSuggestions: 0,
};
const DETAIL = {
  id: "F-001",
  title: "Connexion",
  description: "Se connecter avec son e-mail.",
  priority: "must",
  criteria: [
    {
      id: "AC-1",
      title: "Mot de passe valide",
      steps: [{ type: "quand", text: "je me connecte" }],
    },
  ],
  validation: "validated",
  previouslyValidated: false,
  version: "jeton-opaque",
};
const INTERNAL_KEYS = [
  "filePath",
  "commitSha",
  "branch",
  "tables",
  "endpoints",
  "errorCode",
  "status",
];

type Operation = { responses: Record<string, unknown> };
type Doc = {
  info: { version: string };
  paths: Record<string, Record<string, Operation>>;
  components?: { schemas?: Record<string, unknown> };
};
const doc = async () => (await generateOpenApi()) as unknown as Doc;

describe("CS1 surface : exactement feature, features, projects", () => {
  it("le routeur expose le groupe clientSpace et rien d'autre dans ce groupe", () => {
    const group = (api.contract as unknown as Record<string, object>).clientSpace;
    expect(group).toBeDefined();
    expect(Object.keys(group ?? {}).sort()).toEqual(NAMES);
  });

  it.each([
    ["clientSpace.projects", "/client-space/projects"],
    ["clientSpace.features", "/client-space/projects/{projectId}/features"],
    ["clientSpace.feature", "/client-space/projects/{projectId}/features/{featureId}"],
  ])("%s : GET %s dans l'OpenAPI, lecture seule", async (name, path) => {
    expect(proc(name)).toBeDefined();
    const d = await doc();
    expect(Object.keys(d.paths[path] ?? {})).toEqual(["get"]);
  });

  it("le contrat courant est 2.6.0 (clientSpace est apparu en 0.11.0)", async () => {
    expect(api.CONTRACT_VERSION).toBe("2.6.0");
    expect((await doc()).info.version).toBe("2.6.0");
  });
});

describe("CS2 entrées", () => {
  it("projects : aucune entrée requise", async () => {
    expect(await isValid(input("clientSpace.projects"), {})).toBe(true);
  });

  it("features : projectId UUID requis, limit 1..100, cursor optionnel", async () => {
    const i = input("clientSpace.features");
    expect(await isValid(i, { projectId: UUID })).toBe(true);
    expect(await isValid(i, { projectId: UUID, limit: 100, cursor: "abc" })).toBe(true);
    for (const bad of [
      {},
      { projectId: "x" },
      { projectId: UUID, limit: 0 },
      { projectId: UUID, limit: 101 },
    ]) {
      expect(await isValid(i, bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it("feature : projectId UUID et featureId F-nnn (trois chiffres au moins)", async () => {
    const i = input("clientSpace.feature");
    expect(await isValid(i, { projectId: UUID, featureId: "F-001" })).toBe(true);
    expect(await isValid(i, { projectId: UUID, featureId: "F-1234" })).toBe(true);
    for (const featureId of ["F-1", "f-001", "T-user", "", "F-001/../x"]) {
      expect(await isValid(i, { projectId: UUID, featureId }), featureId).toBe(false);
    }
  });
});

describe("CS3 sorties : vocabulaire métier, rien d'interne", () => {
  it("projects : id, name, phase (framing | iteration)", async () => {
    const o = output("clientSpace.projects");
    expect(await isValid(o, [PROJECT, { ...PROJECT, phase: "iteration" }])).toBe(true);
    expect(await isValid(o, [{ ...PROJECT, phase: "baseline" }])).toBe(false);
    expect(await isValid(o, [{ id: UUID, name: "x" }])).toBe(false);
  });

  it("features : items, version opaque non vide, nextCursor nullable", async () => {
    const o = output("clientSpace.features");
    expect(await isValid(o, { items: [SUMMARY], version: "jeton-opaque", nextCursor: null })).toBe(
      true,
    );
    expect(await isValid(o, { items: [], version: SHA, nextCursor: "c" })).toBe(true);
    expect(await isValid(o, { items: [], version: "", nextCursor: null })).toBe(false);
    expect(await isValid(o, { items: [SUMMARY], nextCursor: null })).toBe(false);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même schéma, un test par comportement
describe("CS3b sorties : valeurs refusées et clés internes écartées", () => {
  it.each([
    ["validation", "ok"],
    ["priority", "high"],
    ["id", "TK-1"],
    ["criteriaCount", -1],
    ["openSuggestions", -1],
  ])("features : %s = %s est refusé", async (key, value) => {
    const o = output("clientSpace.features");
    const bad = { items: [{ ...SUMMARY, [key]: value }], version: "v", nextCursor: null };
    expect(await isValid(o, bad)).toBe(false);
  });

  it.each(["validated", "to_validate", "to_revise"])(
    "validation %s accepté",
    async (validation) => {
      const o = output("clientSpace.features");
      expect(
        await isValid(o, { items: [{ ...SUMMARY, validation }], version: "v", nextCursor: null }),
      ).toBe(true);
    },
  );

  it("feature : détail complet accepté, étapes typées", async () => {
    const o = output("clientSpace.feature");
    expect(await isValid(o, DETAIL)).toBe(true);
    const badStep = {
      ...DETAIL,
      criteria: [{ id: "AC-1", title: "t", steps: [{ type: "puis", text: "x" }] }],
    };
    expect(await isValid(o, badStep)).toBe(false);
  });

  it.each(INTERNAL_KEYS)(
    "feature et features : la clé interne %s n'est jamais conservée",
    async (key) => {
      const detail = await parsed(output("clientSpace.feature"), { ...DETAIL, [key]: "interne" });
      expect(detail, "détail valide").toBeDefined();
      expect(Object.keys(detail ?? {})).not.toContain(key);
      const page = await parsed(output("clientSpace.features"), {
        items: [{ ...SUMMARY, [key]: "interne" }],
        version: "v",
        nextCursor: null,
      });
      expect(JSON.stringify(page)).not.toContain(`"${key}"`);
    },
  );

  it("clés exactes d'une feature de liste et d'un détail", async () => {
    const page = await parsed(output("clientSpace.features"), {
      items: [SUMMARY],
      version: "v",
      nextCursor: null,
    });
    const first = (page?.items as object[] | undefined)?.[0] ?? {};
    expect(Object.keys(first).sort()).toEqual(Object.keys(SUMMARY).sort());
    expect(Object.keys((await parsed(output("clientSpace.feature"), DETAIL)) ?? {}).sort()).toEqual(
      Object.keys(DETAIL).sort(),
    );
  });
});

describe("CS4 erreurs : SPACE_NOT_READY seul, jamais d'erreur de fournisseur ou d'index", () => {
  it.each(["clientSpace.features", "clientSpace.feature"])(
    "%s expose SPACE_NOT_READY (503, sans data) et NOT_FOUND",
    (name) => {
      const declared = errors(name) as Record<string, { status?: number; data?: unknown }>;
      expect(declared.SPACE_NOT_READY?.status, name).toBe(503);
      expect(declared.SPACE_NOT_READY?.data, name).toBeUndefined();
      expect(declared.NOT_FOUND?.status, name).toBe(404);
      expect(declared.UNAUTHORIZED?.status, name).toBe(401);
    },
  );

  it.each(["clientSpace.projects", "clientSpace.features", "clientSpace.feature"])(
    "%s n'expose ni SPEC_INDEX_FAILED, ni PROVIDER_*, ni FORBIDDEN",
    (name) => {
      const codes = Object.keys(errors(name));
      expect(
        codes.filter((code) => code.startsWith("PROVIDER_") || code === "SPEC_INDEX_FAILED"),
      ).toEqual([]);
      expect(codes).not.toContain("FORBIDDEN");
    },
  );

  it.each(["clientSpace.features", "clientSpace.feature"])(
    "%s expose VALIDATION (limit ou identifiant mal formé : 422, jamais 400)",
    (name) => {
      expect(Object.keys(errors(name))).toContain("VALIDATION");
    },
  );

  it("errorStatusMap connaît SPACE_NOT_READY (503) et l'OpenAPI le documente", async () => {
    expect((api.errorStatusMap as Record<string, number>).SPACE_NOT_READY).toBe(503);
    const d = await doc();
    const responses = d.paths["/client-space/projects/{projectId}/features"]?.get?.responses ?? {};
    expect(Object.keys(responses)).toContain("503");
  });
});

describe("CS5 fuite de vocabulaire technique dans le contrat publié", () => {
  const PATHS = [
    "/client-space/projects",
    "/client-space/projects/{projectId}/features",
    "/client-space/projects/{projectId}/features/{featureId}",
  ];

  it("les trois chemins sont présents (la garde ne couvre pas du vide)", async () => {
    const d = await doc();
    for (const path of PATHS) expect(d.paths[path]?.get, path).toBeDefined();
  });

  it.each(PATHS)(
    "%s : aucune clé ni valeur d'énumération du vocabulaire interdit",
    async (path) => {
      const d = await doc();
      const operation = d.paths[path]?.get;
      expect(operation, path).toBeDefined();
      const names = vocabularyOf(operation, d);
      expect(names.length, "le parcours a trouvé des propriétés").toBeGreaterThan(0);
      const leaks = leaksOf(names);
      expect(leaks, `${path} : ${leaks.join(", ")}`).toEqual([]);
    },
  );
});
