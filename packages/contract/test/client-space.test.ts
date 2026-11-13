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
const NAMES = [
  "dataFixtureRows",
  "dataFixtures",
  "dataModel",
  "feature",
  "features",
  "flows",
  "progress",
  "projects",
  "roles",
  "rules",
];
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
  links: [{ id: "R-002", label: "Délai d'annulation" }],
  versionNote: { date: "2026-11-12", label: "e30875d" },
  version: "jeton-opaque",
};
const TAB = { count: 3, units: 3, treated: 1, toRevise: 0 };
const PROGRESS = {
  hasClient: true,
  canValidate: true,
  clientFirstName: "Marie",
  validation: "to_validate",
  tabs: { features: TAB, flows: TAB, rules: { ...TAB, units: 1 }, roles: { ...TAB, units: 1 } },
  untreated: 4,
  toRevise: 0,
  changed: 1,
  next: { kind: "feature", ref: "F-002" },
  version: "jeton-opaque",
};
const PAGE = { nextCursor: null, previousCursor: null, offset: 0, total: 1 };
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
    ["clientSpace.progress", "/client-space/projects/{projectId}/progress"],
    ["clientSpace.flows", "/client-space/projects/{projectId}/flows"],
    ["clientSpace.rules", "/client-space/projects/{projectId}/rules"],
    ["clientSpace.roles", "/client-space/projects/{projectId}/roles"],
    ["clientSpace.dataModel", "/client-space/projects/{projectId}/data/model"],
    ["clientSpace.dataFixtures", "/client-space/projects/{projectId}/data/fixtures"],
    [
      "clientSpace.dataFixtureRows",
      "/client-space/projects/{projectId}/data/fixtures/{fixtureId}/rows",
    ],
  ])("%s : GET %s dans l'OpenAPI, lecture seule", async (name, path) => {
    expect(proc(name)).toBeDefined();
    const d = await doc();
    expect(Object.keys(d.paths[path] ?? {})).toEqual(["get"]);
  });

  it("le contrat courant est 3.7.0 (clientSpace est apparu en 0.11.0)", async () => {
    expect(api.CONTRACT_VERSION).toBe("3.7.0");
    expect((await doc()).info.version).toBe("3.7.0");
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
    expect(
      await isValid(o, {
        items: [SUMMARY],
        version: "jeton-opaque",
        nextCursor: null,
        total: 1,
        offset: 0,
      }),
    ).toBe(true);
    expect(
      await isValid(o, { items: [], version: SHA, nextCursor: "c", total: 0, offset: 0 }),
    ).toBe(true);
    expect(
      await isValid(o, { items: [], version: "", nextCursor: null, total: 0, offset: 0 }),
    ).toBe(false);
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
    const bad = {
      items: [{ ...SUMMARY, [key]: value }],
      version: "v",
      nextCursor: null,
      total: 1,
      offset: 0,
    };
    expect(await isValid(o, bad)).toBe(false);
  });

  it.each(["validated", "to_validate", "to_revise"])(
    "validation %s accepté",
    async (validation) => {
      const o = output("clientSpace.features");
      expect(
        await isValid(o, {
          items: [{ ...SUMMARY, validation }],
          version: "v",
          nextCursor: null,
          total: 1,
          offset: 0,
        }),
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
        total: 1,
        offset: 0,
      });
      expect(JSON.stringify(page)).not.toContain(`"${key}"`);
    },
  );

  it("clés exactes d'une feature de liste et d'un détail", async () => {
    const page = await parsed(output("clientSpace.features"), {
      items: [SUMMARY],
      version: "v",
      nextCursor: null,
      total: 1,
      offset: 0,
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
    "/client-space/projects/{projectId}/progress",
    "/client-space/projects/{projectId}/flows",
    "/client-space/projects/{projectId}/rules",
    "/client-space/projects/{projectId}/roles",
    "/client-space/projects/{projectId}/data/model",
    "/client-space/projects/{projectId}/data/fixtures",
    "/client-space/projects/{projectId}/data/fixtures/{fixtureId}/rows",
  ];

  it("les dix chemins sont présents (la garde ne couvre pas du vide)", async () => {
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

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe("CS5 TK-104 : progression, parcours, règles et rôles", () => {
  it("features : untreated n'accepte que « true », around est un F-nnn exclusif d'un curseur", async () => {
    const i = input("clientSpace.features");
    expect(await isValid(i, { projectId: UUID, untreated: "true", around: "F-248" })).toBe(true);
    expect(await isValid(i, { projectId: UUID, untreated: "false" })).toBe(false);
    expect(await isValid(i, { projectId: UUID, around: "R-001" })).toBe(false);
    expect(await isValid(i, { projectId: UUID, around: "F-001", cursor: "c" })).toBe(false);
  });

  it("la fiche porte des liens libellés et une note de version (date, sept caractères)", async () => {
    const o = output("clientSpace.feature");
    expect(await isValid(o, DETAIL)).toBe(true);
    expect(await isValid(o, { ...DETAIL, versionNote: { date: "2026-11-12", label: SHA } })).toBe(
      false,
    );
    expect(await isValid(o, { ...DETAIL, links: [{ id: "R-002" }] })).toBe(false);
  });

  it("progress : compteurs par onglet, suivante et éléments modifiés ; aucun SHA ni chemin", async () => {
    const o = output("clientSpace.progress");
    expect(await isValid(o, PROGRESS)).toBe(true);
    expect(await isValid(o, { ...PROGRESS, next: null })).toBe(true);
    expect(await isValid(o, { ...PROGRESS, next: { kind: "screen", ref: "S-1" } })).toBe(false);
    expect(await isValid(o, { ...PROGRESS, untreated: -1 })).toBe(false);
    expect(await isValid(input("clientSpace.progress"), { projectId: UUID })).toBe(true);
  });

  it("flows, rules, roles : listes à curseur et jeton de version opaque", async () => {
    const step = { label: "Choisir un créneau" };
    const flow = {
      id: "P-reserver",
      title: "Réserver",
      actor: "Cliente",
      start: step,
      steps: [step],
      errors: [{ step: 1, text: "Créneau pris" }],
      features: ["F-001"],
      validation: "to_validate",
      previouslyValidated: false,
    };
    const rule = {
      id: "R-001",
      title: "Pas de double réservation",
      type: "contrainte",
      statement: "Un créneau n'a qu'une réservation.",
      states: [],
      features: ["F-001"],
    };
    expect(
      await isValid(output("clientSpace.flows"), { items: [flow], ...PAGE, version: "v" }),
    ).toBe(true);
    expect(await isValid(output("clientSpace.flows"), { items: [flow], ...PAGE })).toBe(false);
    const block = { validation: "validated", previouslyValidated: false, version: "v" };
    expect(await isValid(output("clientSpace.rules"), { items: [rule], ...PAGE, ...block })).toBe(
      true,
    );
    const roles = {
      roles: [{ id: "RL-accueil", name: "Accueil" }],
      actions: [
        {
          specId: "PM-booking.read",
          label: "Voir les réservations",
          resource: "booking",
          access: [{ roleId: "RL-accueil", level: "allowed" }],
        },
      ],
      ...block,
    };
    expect(await isValid(output("clientSpace.roles"), roles)).toBe(true);
    const d = await doc();
    for (const route of ["progress", "flows", "rules", "roles"]) {
      const names = vocabularyOf(d.paths[`/client-space/projects/{projectId}/${route}`]?.get, d);
      expect(names.length, route).toBeGreaterThan(0);
      expect(leaksOf(names), route).toEqual([]);
    }
  });
});

describe("TK-105 (3.4.0) : recherche serveur de l'espace client", () => {
  const search = async (path: string, extra: Record<string, unknown> = {}) => {
    const i = input(path);
    expect(await isValid(i, { projectId: UUID, q: "R-0", ...extra }), path).toBe(true);
    for (const q of ["", "x".repeat(201)]) {
      expect(await isValid(i, { projectId: UUID, q }), `${path} q=${q.length}`).toBe(false);
    }
    expect(await isValid(i, { projectId: UUID }), path).toBe(true);
  };

  it("features et parcours : q de 1 à 200 caractères, optionnel", async () => {
    await search("clientSpace.features", { limit: 50 });
    await search("clientSpace.flows", { limit: 6 });
  });

  it("règles : q et type (contrainte, calcul, workflow), le reste est refusé", async () => {
    await search("clientSpace.rules", { type: "calcul", limit: 24 });
    const i = input("clientSpace.rules");
    expect(await isValid(i, { projectId: UUID, type: "inconnu" })).toBe(false);
  });

  it("les parcours n'ont pas de filtre de type", async () => {
    const parsedFlows = await parsed(input("clientSpace.flows"), {
      projectId: UUID,
      type: "calcul",
    });
    expect(JSON.stringify(parsedFlows)).not.toContain("calcul");
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("TK-109 (3.7.0) : modèle de données du point de vue du client", () => {
  const TABLE = {
    id: "T-client",
    name: "Client",
    zone: "Comptes",
    description: "Une personne qui réserve.",
    fields: [{ name: "id", type: "uuid", primaryKey: true, personalData: false }],
    relations: [{ to: "T-reservation", toName: "Réservation", cardinality: "1 → n" }],
    usedBy: [{ id: "F-001", label: "Connexion" }],
    clientSummary: ["Le nom du client"],
  };
  const MODEL = {
    available: true,
    validation: "validated",
    truncated: false,
    items: [TABLE],
    positions: { "T-client": { x: 10, y: 20 } },
  };

  it("dataModel : tables et positions ; non validé = available faux et aucune table", async () => {
    const o = output("clientSpace.dataModel");
    expect(await isValid(o, MODEL)).toBe(true);
    expect(
      await isValid(o, {
        ...MODEL,
        available: false,
        validation: "to_validate",
        items: [],
        positions: {},
      }),
    ).toBe(true);
    expect(await isValid(o, { ...MODEL, validation: "ok" })).toBe(false);
    expect(await isValid(input("clientSpace.dataModel"), { projectId: UUID })).toBe(true);
  });

  it("dataModel : jamais de contrainte, de valeur, de règle par champ, de chemin ni de SHA", async () => {
    const value = await parsed(output("clientSpace.dataModel"), {
      ...MODEL,
      items: [
        {
          ...TABLE,
          filePath: "data/tables/client.yaml",
          fields: [{ ...TABLE.fields[0], constraints: "x", values: ["a"], rule: "R-004" }],
        },
      ],
    });
    const [item] = (value?.items ?? []) as Record<string, unknown>[];
    expect(Object.keys(item ?? {})).not.toContain("filePath");
    const [field] = (item?.fields ?? []) as Record<string, unknown>[];
    expect(Object.keys(field ?? {}).sort()).toEqual(["name", "personalData", "primaryKey", "type"]);
  });

  it("dataFixtures et dataFixtureRows : jeux et lignes paginées par 25", async () => {
    const list = output("clientSpace.dataFixtures");
    const item = {
      specId: "FX-clients",
      title: "Clients",
      table: "T-client",
      locale: "fr-FR",
      rowCount: 3,
    };
    expect(await isValid(list, { items: [item] })).toBe(true);
    expect(await isValid(list, { items: [{ ...item, filePath: "x" }] })).toBe(true);
    const rows = input("clientSpace.dataFixtureRows");
    expect(
      await isValid(rows, { projectId: UUID, fixtureId: "FX-clients", page: 1, size: 25 }),
    ).toBe(true);
    expect(
      await isValid(rows, { projectId: UUID, fixtureId: "FX-clients", page: 1, size: 10 }),
    ).toBe(false);
    expect(
      await isValid(rows, { projectId: UUID, fixtureId: "T-clients", page: 1, size: 25 }),
    ).toBe(false);
  });

  it("les trois lectures ne déclarent aucun mot interdit côté client", async () => {
    const d = await doc();
    for (const route of ["data/model", "data/fixtures", "data/fixtures/{fixtureId}/rows"]) {
      const names = vocabularyOf(d.paths[`/client-space/projects/{projectId}/${route}`]?.get, d);
      expect(names.length, route).toBeGreaterThan(0);
      expect(leaksOf(names), route).toEqual([]);
    }
  });
});
