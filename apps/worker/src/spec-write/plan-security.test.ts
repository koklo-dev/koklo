import {
  emitDocSection,
  emitFeatureMarkdown,
  emitRolesYaml,
  emitSecurityDataYaml,
  emitTableYaml,
  emitThreatYaml,
  parseSpecFiles,
  SECRET_REFUSAL_MESSAGE,
} from "@koklo/schema";
import { describe, expect, it } from "vitest";
import { defaultSubject } from "./message.ts";
import { integrityProblem } from "./paths.ts";
import { planBatch } from "./plan.ts";
import type { BatchOperation, LoadedBatch } from "./types.ts";

/**
 * TK-117 lot B (cas 1, 2, B791 à B796, B815, B817) : opérations de la Sécurité du plan (pur). Fichiers `security/`,
 * matrice et scénarios d'abus régénérés dans le même commit, périmés supprimés, table développée en champs, conservation
 * humaine seule, restrictions sans octroi, droits du designer et refus de toute valeur de secret.
 */
const MANIFEST = {
  path: "koklo.project.yaml",
  content: "projet: demo\norganisation: acme\nspec_version: 2\n",
};
const table = {
  path: "data/tables/clientes.yaml",
  content: emitTableYaml({
    id: "T-clientes",
    nom: "Clientes",
    zone: "Clientèle",
    champs: [
      { nom: "id", type: "uuid", cle: "primaire" },
      { nom: "telephone", type: "texte(20)" },
    ],
  }),
};
const roles = {
  path: "domain/roles.yaml",
  content: emitRolesYaml({
    permissions: [
      {
        id: "PM-client.lire",
        ressource: "client",
        action: "lire",
        conditions: [],
        endpoints: ["client.list"],
      },
      {
        id: "PM-client.exporter",
        ressource: "client",
        action: "exporter",
        conditions: [],
        endpoints: [],
      },
    ],
    roles: [
      {
        id: "RL-accueil",
        nom: "Accueil",
        description: "Accueil",
        permissions: ["PM-client.lire"],
      },
      {
        id: "RL-gerante",
        nom: "Gérante",
        description: "Gérante",
        permissions: ["PM-client.lire", "PM-client.exporter"],
      },
    ],
  }),
};
const feature = {
  path: "features/F-001-fichier.md",
  content: emitFeatureMarkdown({
    id: "F-001",
    titre: "Fichier clientes",
    statut: "specifiee",
    priorite: "must",
    description: "Le fichier.",
    tables: [],
    endpoints: [],
    ecrans: [],
    roles: [],
    regles: [],
    nfr: [],
    criteres: [],
  }),
};
const operation = {
  path: "api/endpoints/client.list.yaml",
  content:
    "id: client.list\ntype: lecture\nzone: Clientes\ncomposant: C-api\nresume: Liste.\npermission: PM-client.lire\nsert:\n  - F-001\n",
};
const threat = {
  path: "security/threats/SEC-T01.yaml",
  content: emitThreatYaml({
    id: "SEC-T01",
    titre: "Fichier lu par un inconnu",
    surfaces: ["F-001"],
    categorie: "acces_non_autorise",
    gravite: "elevee",
    risque: "Lecture.",
    parades: ["Contrôle du rôle."],
    verification: { mode: "scenario" },
  }),
};
const data = {
  path: "security/data.yaml",
  content: emitSecurityDataYaml({
    donnees: [
      {
        donnee: "Identifiant",
        champs: ["clientes.id"],
        categorie: "technique",
        conservation_proposee: "1 an",
      },
    ],
  }),
};
const staleScenario = {
  path: "quality/scenarios/abuse/SEC-T09.feature",
  content: "# language: fr\n",
};
const handwritten = { path: "quality/scenarios/abuse/manuel.feature", content: "x\n" };
const BASE = [MANIFEST, table, roles, feature, operation, threat, data];
const TREE = [...BASE, staleScenario, handwritten].map((file) => file.path);

let position = 0;
const op = (kind: string, targetSpecId: string | null, payload = {}): BatchOperation => {
  position += 1;
  return { position, kind, targetSpecId, payload };
};
const run = (operations: BatchOperation[], authorRole = "dev", files = BASE) =>
  planBatch({ operations, authorRole }, files, TREE);

function changesOf(operations: BatchOperation[], files = BASE) {
  const plan = run(operations, "dev", files);
  if ("outcome" in plan) throw new Error(JSON.stringify(plan.outcome));
  const changes = new Map(plan.changes.map((change) => [change.path, change]));
  const text = (path: string) => {
    const change = changes.get(path);
    return change && "content" in change ? (change.content as string) : "";
  };
  const merged = new Map(files.map((file) => [file.path, file.content]));
  for (const change of plan.changes) {
    if ("content" in change) merged.set(change.path, change.content as string);
    else merged.delete(change.path);
  }
  const spec = parseSpecFiles([...merged].map(([path, content]) => ({ path, content }))).spec;
  return { changes, text, spec };
}
const outcomeOf = (operations: BatchOperation[], role = "dev") => {
  const plan = run(operations, role);
  return "outcome" in plan ? plan.outcome : undefined;
};

const NEW_THREAT = {
  title: "Export massif",
  surfaces: ["F-001", "api"],
  category: "data_leak",
  severity: "high",
  risk: "Tout sort.\nPuis revient.",
  verification: "scenario",
  measures: ["Second facteur."],
  scenario: { when: "le compte exporte", expected: "un second facteur est demandé" },
  links: ["RL-gerante", "clientes.telephone"],
};

describe("plan : menaces", () => {
  it("créer écrit la menace traduite, la matrice et les scénarios dans le même lot", () => {
    const { changes, text, spec } = changesOf([op("threat.create", "SEC-T02", NEW_THREAT)]);
    const created = spec.threats.find((entry) => entry.value.id === "SEC-T02")?.value;
    expect(created).toMatchObject({
      titre: "Export massif",
      categorie: "fuite_donnees",
      gravite: "elevee",
      verification: { mode: "scenario" },
      scenario: { quand: "le compte exporte", alors: "un second facteur est demandé" },
      parades: ["Second facteur."],
    });
    expect(text("quality/scenarios/abuse/SEC-T02.feature")).toContain("@SEC-T02 @F-001 @api @abus");
    expect(text("security/rights.yaml")).toContain("acces: non");
    expect(text("quality/scenarios/abuse/droits-accueil.feature")).toContain("@droits @abus");
    expect(changes.get("quality/scenarios/abuse/SEC-T09.feature")).toMatchObject({
      delete: true,
    });
    expect(changes.has("quality/scenarios/abuse/manuel.feature")).toBe(false);
  });

  it("modifier puis supprimer : scénario retiré avec la menace", () => {
    const updated = changesOf([
      op("threat.update", "SEC-T01", { measures: [], verification: "human_review" }),
    ]);
    expect(updated.spec.threats[0]?.value.parades).toEqual([]);
    expect(updated.changes.has("quality/scenarios/abuse/SEC-T01.feature")).toBe(false);
    const removed = changesOf([op("threat.delete", "SEC-T01")]);
    expect(removed.changes.get("security/threats/SEC-T01.yaml")).toMatchObject({ delete: true });
  });

  it("menace inconnue ou identifiant pris : conflit ; fonctionnalité inconnue : spec invalide", () => {
    expect(outcomeOf([op("threat.update", "SEC-T05", { severity: "low" })])).toMatchObject({
      errorCode: "write_conflict",
    });
    expect(outcomeOf([op("threat.create", "SEC-T01", NEW_THREAT)])).toMatchObject({
      errorCode: "write_conflict",
    });
    expect(
      outcomeOf([op("threat.create", "SEC-T03", { ...NEW_THREAT, surfaces: ["F-999"] })]),
    ).toMatchObject({ errorCode: "SPEC_INVALID" });
  });

  it("texte qui voudrait ouvrir une ligne : refusé, rien n'est écrit", () => {
    const injected = { ...NEW_THREAT, title: "a\n  Scénario: b" };
    expect(outcomeOf([op("threat.create", "SEC-T04", injected)])).toMatchObject({
      errorCode: "SPEC_INVALID",
    });
  });
});

describe("plan : données", () => {
  it("une table seule est développée en ses champs libres ; la conservation vient de la saisie", () => {
    const { spec } = changesOf([
      op("sensitive.create", "clientes.telephone", {
        data: "Téléphone",
        fields: ["clientes.telephone"],
        category: "contact",
        retention: "3 ans",
        access: ["Accueil"],
        protection: "Masqué.",
      }),
    ]);
    expect(spec.securityData[0]?.value.donnees[1]).toMatchObject({
      champs: ["clientes.telephone"],
      categorie: "contact",
      conservation: "3 ans",
    });
    const whole = changesOf(
      [op("sensitive.create", null, { data: "Table", fields: ["clientes"], category: "secret" })],
      [MANIFEST, table, roles, feature, operation],
    );
    expect(whole.spec.securityData[0]?.value.donnees[0]?.champs).toEqual([
      "clientes.id",
      "clientes.telephone",
    ]);
  });

  it("modifier : la suggestion reste, « retention » vide retire la durée ; supprimer retire l'entrée", () => {
    const first = changesOf([op("sensitive.update", "clientes.id", { retention: "1 an" })]);
    expect(first.spec.securityData[0]?.value.donnees[0]).toMatchObject({
      conservation: "1 an",
      conservation_proposee: "1 an",
    });
    const files = BASE.map((file) =>
      file.path === data.path ? { path: data.path, content: first.text(data.path) } : file,
    );
    const cleared = changesOf([op("sensitive.update", "clientes.id", { retention: "" })], files);
    expect(cleared.spec.securityData[0]?.value.donnees[0]?.conservation).toBeUndefined();
    const removed = changesOf([op("sensitive.delete", "clientes.id")]);
    expect(removed.spec.securityData[0]?.value.donnees).toEqual([]);
  });

  it("champ déjà classé : spec invalide ; entrée inconnue : conflit", () => {
    expect(
      outcomeOf([
        op("sensitive.create", "clientes.id", {
          data: "Encore",
          fields: ["clientes.id"],
          category: "technical",
        }),
      ]),
    ).toMatchObject({ errorCode: "SPEC_INVALID" });
    expect(outcomeOf([op("sensitive.update", "clientes.nom", { access: [] })])).toMatchObject({
      errorCode: "write_conflict",
    });
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même plan, un test par comportement
describe("plan : droits, exigences, résumé et document", () => {
  it("une restriction ne fait que restreindre ; règle de propriété ajoutée puis retirée", () => {
    const { spec, text } = changesOf([
      op("right.create", null, {
        role: "RL-gerante",
        permission: "PM-client.exporter",
        restriction: "avec second facteur",
      }),
      op("right.create", null, { ownershipRule: "Chacun voit les siens." }),
    ]);
    const rights = spec.rights[0]?.value;
    expect(rights?.propriete).toEqual(["Chacun voit les siens."]);
    const row = rights?.matrice.find((entry) => entry.action === "PM-client.exporter");
    expect(row?.cases.map((cell) => cell.acces)).toEqual(["non", "restreint"]);
    expect(text("quality/scenarios/abuse/droits-gerante.feature")).toContain("second facteur");
  });

  it("niveau, exigence numérotée par le worker, réponse et faits", () => {
    const { spec } = changesOf([
      op("asvs.set_level", null, { level: 3 }),
      op("asvs.create", null, { chapter: "sessions", title: "Expiration", level: 1 }),
      op("asvs.update", null, { requirementId: "EX-001", answer: "30 minutes" }),
      op("asvs.update", null, { facts: [{ label: "Secrets", value: "Coffre" }] }),
    ]);
    expect(spec.asvs[0]?.value).toMatchObject({
      niveau: 3,
      exigences: [
        { id: "EX-001", chapitre: "sessions", titre: "Expiration", reponse: "30 minutes" },
      ],
      secrets_et_dependances: [{ libelle: "Secrets", valeur: "Coffre" }],
    });
    expect(
      outcomeOf([op("asvs.update", null, { requirementId: "EX-404", answer: "x" })]),
    ).toMatchObject({ errorCode: "write_conflict" });
  });

  it("résumé : cartes écrites, conservation composée des durées saisies", () => {
    const { spec } = changesOf([
      op("sensitive.update", "clientes.id", { category: "contact", retention: "2 ans" }),
      op("summary.update", null, { incident: "Nous prévenons sous 24 heures." }),
    ]);
    expect(spec.securitySummaries[0]?.value).toMatchObject({
      incident: "Nous prévenons sous 24 heures.",
      donnees: "À préciser",
      conservation: "Identifiant : 2 ans.",
    });
  });

  it("section du dossier de sécurité numérotée dans son dossier", () => {
    const dossier = {
      path: "security/dossier/01-objet.md",
      content: emitDocSection({ title: "Objet", status: "validee", markdown: "But." }),
    };
    const { changes } = changesOf(
      [
        op("doc.section.create", "DOC-incident", {
          deliverable: "security",
          title: "Incident",
          markdown: "Qui prévenir.",
        }),
      ],
      [...BASE, dossier],
    );
    expect(changes.has("security/dossier/02-incident.md")).toBe(true);
  });

  it("un lot de rôles régénère la matrice et les scénarios si rights.yaml existe", () => {
    const withRights = [
      ...BASE,
      { path: "security/rights.yaml", content: "restrictions: []\npropriete:\n  - R.\n" },
    ];
    const { text, changes } = changesOf(
      [op("role.update", "RL-accueil", { description: "Accueil du jour" })],
      withRights,
    );
    expect(text("security/rights.yaml")).toContain("- R.");
    expect(changes.has("quality/scenarios/abuse/droits-accueil.feature")).toBe(true);
    const without = changesOf([op("role.update", "RL-accueil", { description: "x" })]);
    expect([...without.changes.keys()]).toEqual(["domain/roles.yaml"]);
  });
});

describe("plan : fichier de la Sécurité illisible, aucun scénario d'abus perdu", () => {
  const generated = (path: string) => ({ path, content: "# language: fr\n" });
  const KEPT = [
    "quality/scenarios/abuse/droits-accueil.feature",
    "quality/scenarios/abuse/droits-gerante.feature",
    "quality/scenarios/abuse/SEC-T01.feature",
  ];
  const deletedBy = (files: typeof BASE) => {
    const tree = [
      ...files.map((file) => file.path),
      ...TREE,
      ...KEPT.map(generated).map((f) => f.path),
    ];
    const operations = [op("asvs.set_level", null, { level: 2 })];
    const plan = planBatch({ operations, authorRole: "dev" }, files, tree);
    if ("outcome" in plan) throw new Error(JSON.stringify(plan.outcome));
    expect(plan.changes.map((change) => change.path)).toContain("security/asvs.yaml");
    return plan.changes.filter((change) => "delete" in change).map((change) => change.path);
  };

  it("rights.yaml illisible : aucun droits-*.feature supprimé, le fichier n'est pas réécrit", () => {
    const broken = { path: "security/rights.yaml", content: "restrictions: oups\n" };
    expect(deletedBy([...BASE, broken])).toEqual(["quality/scenarios/abuse/SEC-T09.feature"]);
  });

  it("menace illisible : son scénario reste, celui d'une menace disparue part", () => {
    const broken = { path: threat.path, content: "id: SEC-T01\ngravite: oups\n" };
    const files = BASE.map((file) => (file.path === threat.path ? broken : file));
    // La gérante a toutes les permissions : son fichier de droits est réellement périmé.
    expect(deletedBy(files).sort()).toEqual([
      "quality/scenarios/abuse/SEC-T09.feature",
      "quality/scenarios/abuse/droits-gerante.feature",
    ]);
  });
});

describe("plan : gardes", () => {
  it.each([
    ["threat.create", "SEC-T02", NEW_THREAT],
    ["sensitive.delete", "clientes.id", {}],
    ["right.create", null, { ownershipRule: "x" }],
    ["asvs.set_level", null, { level: 2 }],
    ["summary.update", null, { access: "x" }],
  ])("designer : %s refusé", (kind, target, payload) => {
    expect(outcomeOf([op(kind, target, payload)], "designer")).toMatchObject({
      errorCode: "FORBIDDEN",
    });
  });

  it("une valeur de secret est refusée avant toute branche, sans être recopiée", () => {
    const secret = ["sk", "live", "y".repeat(32)].join("_");
    const outcome = outcomeOf([op("summary.update", null, { access: secret })]);
    expect(outcome).toMatchObject({ errorCode: "SPEC_INVALID" });
    expect(JSON.stringify(outcome)).toContain(SECRET_REFUSAL_MESSAGE);
    expect(JSON.stringify(outcome)).not.toContain("y".repeat(32));
  });

  it("intégrité : identifiants cibles par genre", () => {
    const batch = (operations: BatchOperation[]) =>
      ({
        branch: "cadrage",
        repo: { specPath: null },
        operations,
      }) as unknown as LoadedBatch;
    for (const valid of [
      op("threat.update", "SEC-T12"),
      op("sensitive.create", null),
      op("sensitive.create", "t.a"),
      op("sensitive.delete", "t.a"),
      op("right.delete", null),
      op("asvs.update", null),
      op("summary.update", null),
    ]) {
      expect(integrityProblem(batch([valid])), valid.kind).toBeUndefined();
    }
    for (const invalid of [
      op("threat.update", "../x"),
      op("sensitive.update", null),
      op("sensitive.update", "../data"),
      op("summary.update", "F-001"),
    ]) {
      expect(integrityProblem(batch([invalid])), invalid.kind).toBe("specId");
    }
  });

  it("objet du commit : les opérations sans cible sont nommées par leur genre", () => {
    expect(
      defaultSubject([
        op("threat.create", "SEC-T02"),
        op("summary.update", null),
        op("right.create", null),
      ]),
    ).toBe("spec: créé SEC-T02, droits ; modifié résumé client");
  });
});
