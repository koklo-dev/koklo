import {
  emitComponentYaml,
  emitFeatureMarkdown,
  emitFlowYaml,
  emitRolesYaml,
  emitTableYaml,
  parseAdrMarkdown,
  parseDocSection,
  parseSpecFiles,
} from "@koklo/schema";
import { describe, expect, it } from "vitest";
import { integrityProblem } from "./paths.ts";
import { planBatch } from "./plan.ts";
import type { BatchOperation } from "./types.ts";

/**
 * TK-111 lot B (B506 à B515) : opérations component.*, archflow.*, adr.*, doc.section.* du plan (pur) : fichiers de
 * l'architecture, `architecture/schema.mmd` et `architecture/flows/<P-id>.mmd` régénérés dans le MÊME lot, conflits,
 * droits, références vérifiées (`ARCH_UNKNOWN_*`).
 */
const MANIFEST = {
  path: "koklo.project.yaml",
  content: "projet: demo\norganisation: acme\nspec_version: 2\n",
};
const feature = (id: string) => ({
  path: `features/${id}-x.md`,
  content: emitFeatureMarkdown({
    id,
    titre: `Feature ${id}`,
    statut: "brouillon",
    priorite: "should",
    tables: [],
    endpoints: [],
    ecrans: [],
    roles: [],
    regles: [],
    nfr: [],
    description: "",
    criteres: [],
  }),
});
const tableFile = (slug: string) => ({
  path: `data/tables/${slug}.yaml`,
  content: emitTableYaml({
    id: `T-${slug}`,
    nom: slug,
    zone: "Clients",
    source: ["F-001"],
    champs: [{ nom: "id", type: "uuid", cle: "primaire" }],
  }),
});
const businessFlow = (id: string) => ({
  path: `design/flows/${id}.yaml`,
  content: emitFlowYaml({
    id,
    titre: "Réserver",
    acteur: "Client",
    depart: { libelle: "Ouvrir" },
    etapes: [{ libelle: "Choisir" }],
    erreurs: [],
    fonctionnalites: [],
  }),
});
const roles = {
  path: "domain/roles.yaml",
  content: emitRolesYaml({
    roles: [{ id: "RL-client", nom: "Client", description: "Réserve.", permissions: [] }],
    permissions: [],
  }),
};
const componentFile = (slug: string, extra: Record<string, unknown> = {}) => ({
  path: `architecture/components/${slug}.yaml`,
  content: emitComponentYaml({
    id: `C-${slug}`,
    nom: slug.toUpperCase(),
    type: "service",
    zone: "Noyau",
    responsabilite: "Fait son travail.",
    possede: [],
    sert: [],
    depend_de: [],
    decisions: [],
    ...extra,
  }),
});
const BASE = [
  MANIFEST,
  feature("F-001"),
  tableFile("client"),
  businessFlow("P-reserver"),
  roles,
  componentFile("api"),
];

const op = (kind: string, targetSpecId: string | null, payload = {}): BatchOperation => ({
  position: 1,
  kind,
  targetSpecId,
  payload,
});
const plan = (operations: BatchOperation[], files = BASE, authorRole = "dev") =>
  planBatch({ operations, authorRole, enqueuedAt: new Date("2026-11-21T10:00:00Z") }, files);
const changes = (result: ReturnType<typeof plan>) => ("changes" in result ? result.changes : []);
const contentOf = (result: ReturnType<typeof plan>, path: string) => {
  const change = changes(result).find((c) => c.path === path);
  return change && "content" in change ? change.content : undefined;
};
const paths = (result: ReturnType<typeof plan>) =>
  changes(result)
    .map((c) => c.path)
    .sort();
const issueCodes = (result: ReturnType<typeof plan>) =>
  "outcome" in result && "report" in result.outcome
    ? (result.outcome.report?.issues.map((i) => i.code) ?? [])
    : [];

const COMPONENT = {
  name: "Base",
  type: "store",
  zone: "Noyau",
  responsibility: "Garde les tables.",
  owns: ["T-client"],
  serves: ["F-001"],
  dependsOn: [{ to: "C-api", via: "SQL", async: true }],
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même famille d'opérations, un test par comportement
describe("composants : component.create, update, delete", () => {
  it("create écrit architecture/components/<slug>.yaml relisible ET architecture/schema.mmd dans le même lot", () => {
    const result = plan([op("component.create", "C-base", COMPONENT)]);
    expect(paths(result)).toEqual(["architecture/components/base.yaml", "architecture/schema.mmd"]);
    const spec = parseSpecFiles([
      ...BASE,
      {
        path: "architecture/components/base.yaml",
        content: contentOf(result, "architecture/components/base.yaml") ?? "",
      },
    ]).spec;
    expect(spec.components.find((c) => c.value.id === "C-base")?.value).toMatchObject({
      nom: "Base",
      type: "store",
      possede: ["T-client"],
      sert: ["F-001"],
      depend_de: [{ vers: "C-api", via: "SQL", mode: "asynchrone" }],
    });
    expect(contentOf(result, "architecture/schema.mmd")).toContain("flowchart");
    expect(contentOf(result, "architecture/schema.mmd")).toContain("Base");
  });

  it("mêmes entrées, mêmes octets", () => {
    const a = plan([op("component.create", "C-base", COMPONENT)]);
    const b = plan([op("component.create", "C-base", COMPONENT)]);
    expect(changes(a)).toEqual(changes(b));
  });

  it("texte hostile : le schéma Mermaid ne porte ni guillemet ni point-virgule bruts", () => {
    const result = plan([
      op("component.create", "C-base", { ...COMPONENT, name: 'Base"; click x call alert(1)' }),
    ]);
    const mmd = contentOf(result, "architecture/schema.mmd") ?? "";
    expect(mmd).not.toContain('Base"');
    expect(mmd).not.toContain("alert(1)");
  });

  it("référence inconnue (table, fonctionnalité, composant, décision) : SPEC_INVALID ARCH_UNKNOWN_*", () => {
    const unknown = plan([
      op("component.create", "C-base", {
        ...COMPONENT,
        owns: ["T-absente"],
        serves: ["F-099"],
        dependsOn: [{ to: "C-fantome", via: "SQL" }],
        decisions: ["ADR-042"],
      }),
    ]);
    expect(unknown).toMatchObject({ outcome: { status: "failed", errorCode: "SPEC_INVALID" } });
    expect(issueCodes(unknown)).toEqual(
      expect.arrayContaining([
        "ARCH_UNKNOWN_TABLE",
        "ARCH_UNKNOWN_FEATURE",
        "ARCH_UNKNOWN_COMPONENT",
        "ARCH_UNKNOWN_DECISION",
      ]),
    );
  });

  it("un composant ext qui possède une table ne bloque pas (avertissement hors rapport)", () => {
    const result = plan([op("component.create", "C-base", { ...COMPONENT, type: "ext" })]);
    expect(paths(result)).toContain("architecture/components/base.yaml");
  });

  it("update : champs présents remplacés, autres conservés ; schema.mmd régénéré", () => {
    const files = [...BASE, componentFile("base", { possede: ["T-client"] })];
    const result = plan(
      [op("component.update", "C-base", { zone: "Bord", clientSummary: ["Phrase."] })],
      files,
    );
    expect(paths(result)).toEqual(["architecture/components/base.yaml", "architecture/schema.mmd"]);
    const spec = parseSpecFiles([
      ...files.filter((f) => f.path !== "architecture/components/base.yaml"),
      {
        path: "architecture/components/base.yaml",
        content: contentOf(result, "architecture/components/base.yaml") ?? "",
      },
    ]).spec;
    expect(spec.components.find((c) => c.value.id === "C-base")?.value).toMatchObject({
      zone: "Bord",
      possede: ["T-client"],
      resume_client: ["Phrase."],
    });
  });

  it("TK-114d (B650, B659) : actors écrit acteurs à la création, remplace la liste à la mise à jour", () => {
    const created = plan([
      op("component.create", "C-base", { ...COMPONENT, type: "app", actors: ["RL-client"] }),
    ]);
    expect(contentOf(created, "architecture/components/base.yaml")).toContain(
      "acteurs:\n  - RL-client\n",
    );
    const files = [...BASE, componentFile("base", { type: "app", acteurs: ["RL-client"] })];
    const cleared = plan([op("component.update", "C-base", { actors: [] })], files);
    expect(contentOf(cleared, "architecture/components/base.yaml")).not.toContain("acteurs");
    const kept = plan([op("component.update", "C-base", { zone: "Bord" })], files);
    expect(contentOf(kept, "architecture/components/base.yaml")).toContain("acteurs:");
  });

  it("delete retire le fichier ; un composant encore cité par un autre est refusé (ARCH_UNKNOWN_COMPONENT)", () => {
    const files = [...BASE, componentFile("base", { depend_de: [{ vers: "C-api", via: "SQL" }] })];
    const removed = plan([op("component.delete", "C-base")], files);
    expect(changes(removed).find((c) => c.path === "architecture/components/base.yaml")).toEqual({
      path: "architecture/components/base.yaml",
      delete: true,
    });
    const refused = plan([op("component.delete", "C-api")], files);
    expect(issueCodes(refused)).toContain("ARCH_UNKNOWN_COMPONENT");
  });

  it("dernier composant supprimé : schema.mmd supprimé aussi", () => {
    const first = plan([op("component.create", "C-base", { ...COMPONENT, dependsOn: [] })]);
    const files = [...BASE, ...changes(first).flatMap((c) => ("content" in c ? [c] : []))];
    const result = plan([op("component.delete", "C-base"), op("component.delete", "C-api")], files);
    expect(changes(result).find((c) => c.path === "architecture/schema.mmd")).toEqual({
      path: "architecture/schema.mmd",
      delete: true,
    });
  });

  it("conflits : créer un identifiant pris, modifier ou supprimer un absent", () => {
    for (const operation of [
      op("component.create", "C-api", COMPONENT),
      op("component.update", "C-absent", { zone: "x" }),
      op("component.delete", "C-absent"),
    ]) {
      expect(plan([operation]), operation.kind).toEqual({
        outcome: { status: "conflict", errorCode: "write_conflict" },
      });
    }
  });

  it("le designer n'écrit pas l'architecture (FORBIDDEN)", () => {
    for (const operation of [
      op("component.create", "C-base", COMPONENT),
      op("adr.create", "ADR-001", { title: "T", context: "C", decision: "D" }),
      op("doc.section.create", "DOC-contexte", { title: "T", markdown: "x" }),
    ]) {
      expect(plan([operation], BASE, "designer"), operation.kind).toEqual({
        outcome: { status: "failed", errorCode: "FORBIDDEN" },
      });
    }
  });
});

const FLOW = {
  flow: "P-reserver",
  participants: ["RL-client", "C-api"],
  messages: [
    { from: "RL-client", to: "C-api", text: "Réserve", reply: "Confirmé" },
    {
      block: "alt",
      label: "Créneau pris",
      messages: [{ from: "C-api", to: "RL-client", text: "Refus", error: "409" }],
    },
    { block: "separator", label: "Plus tard" },
  ],
  features: ["F-001"],
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même famille d'opérations, un test par comportement
describe("flux techniques : archflow.create, update, delete", () => {
  it("create écrit architecture/flows/<P-id>.yaml et son .mmd (noms lisibles) dans le même lot", () => {
    const result = plan([op("archflow.create", "P-reserver", FLOW)]);
    expect(paths(result)).toEqual([
      "architecture/flows/P-reserver.mmd",
      "architecture/flows/P-reserver.yaml",
    ]);
    const mmd = contentOf(result, "architecture/flows/P-reserver.mmd") ?? "";
    expect(mmd).toContain("sequenceDiagram");
    expect(mmd).toContain("Client");
    expect(mmd).toContain("Créneau pris");
    const spec = parseSpecFiles([
      ...BASE,
      {
        path: "architecture/flows/P-reserver.yaml",
        content: contentOf(result, "architecture/flows/P-reserver.yaml") ?? "",
      },
    ]).spec;
    expect(spec.archFlows[0]?.value).toMatchObject({
      id: "P-reserver",
      participants: ["RL-client", "C-api"],
      fonctionnalites: ["F-001"],
    });
  });

  it("parcours inconnu ou participant inconnu : SPEC_INVALID", () => {
    expect(
      issueCodes(plan([op("archflow.create", "P-autre", { ...FLOW, flow: "P-autre" })])),
    ).toContain("ARCH_UNKNOWN_FLOW");
    expect(
      issueCodes(
        plan([
          op("archflow.create", "P-reserver", {
            ...FLOW,
            participants: ["RL-client", "C-fantome"],
            messages: [{ from: "RL-client", to: "C-fantome", text: "x" }],
          }),
        ]),
      ),
    ).toContain("ARCH_UNKNOWN_COMPONENT");
  });

  it("renommer un composant régénère le .mmd des flux qui le citent, dans le même lot", () => {
    const created = plan([op("archflow.create", "P-reserver", FLOW)]);
    const files = [...BASE, ...changes(created).flatMap((c) => ("content" in c ? [c] : []))];
    const result = plan([op("component.update", "C-api", { name: "Passerelle" })], files);
    expect(paths(result)).toEqual([
      "architecture/components/api.yaml",
      "architecture/flows/P-reserver.mmd",
      "architecture/schema.mmd",
    ]);
    expect(contentOf(result, "architecture/flows/P-reserver.mmd")).toContain("Passerelle");
  });

  it("update puis delete : le .mmd suit le .yaml ; conflits d'identité", () => {
    const created = plan([op("archflow.create", "P-reserver", FLOW)]);
    const files = [...BASE, ...changes(created).flatMap((c) => ("content" in c ? [c] : []))];
    const updated = plan(
      [op("archflow.update", "P-reserver", { messages: [FLOW.messages[0]] })],
      files,
    );
    expect(paths(updated)).toEqual([
      "architecture/flows/P-reserver.mmd",
      "architecture/flows/P-reserver.yaml",
    ]);
    const deleted = plan([op("archflow.delete", "P-reserver")], files);
    expect(changes(deleted)).toEqual(
      expect.arrayContaining([
        { path: "architecture/flows/P-reserver.yaml", delete: true },
        { path: "architecture/flows/P-reserver.mmd", delete: true },
      ]),
    );
    expect(plan([op("archflow.create", "P-reserver", FLOW)], files)).toEqual({
      outcome: { status: "conflict", errorCode: "write_conflict" },
    });
    expect(plan([op("archflow.update", "P-reserver", { features: [] })])).toEqual({
      outcome: { status: "conflict", errorCode: "write_conflict" },
    });
  });
});

describe("décisions : adr.create, update, delete", () => {
  const ADR = {
    title: "PostgreSQL",
    context: "Il faut une base.",
    decision: "PostgreSQL 17.",
    positives: ["Transactions"],
    accepted: ["Montée en charge verticale"],
    alternatives: [{ name: "MySQL", reason: "Moins de types" }],
    plain: "Une seule base.",
    links: ["C-api", "F-001"],
  };

  it("create écrit architecture/adr/<ADR-nnn>-<slug>.md : statut proposée, date du lot, relisible", () => {
    const result = plan([op("adr.create", "ADR-001", ADR)]);
    const path = "architecture/adr/ADR-001-postgresql.md";
    expect(paths(result)).toEqual([path]);
    const parsed = parseAdrMarkdown(path, contentOf(result, path) ?? "");
    expect(parsed.ok && parsed.value).toMatchObject({
      id: "ADR-001",
      titre: "PostgreSQL",
      statut: "proposee",
      date: "2026-11-21",
      contexte: "Il faut une base.",
      consequences: { positives: ["Transactions"], a_accepter: ["Montée en charge verticale"] },
      alternatives: [{ nom: "MySQL", raison: "Moins de types" }],
      en_clair: "Une seule base.",
      liens: ["C-api", "F-001"],
    });
  });

  it("lien inconnu : SPEC_INVALID ; update change le statut ; delete retire le fichier", () => {
    expect(
      issueCodes(plan([op("adr.create", "ADR-001", { ...ADR, links: ["C-fantome"] })])),
    ).toContain("ARCH_UNKNOWN_COMPONENT");
    const created = plan([op("adr.create", "ADR-001", ADR)]);
    const files = [...BASE, ...changes(created).flatMap((c) => ("content" in c ? [c] : []))];
    const path = "architecture/adr/ADR-001-postgresql.md";
    const accepted = plan([op("adr.update", "ADR-001", { status: "acceptee" })], files);
    const parsed = parseAdrMarkdown(path, contentOf(accepted, path) ?? "");
    expect(parsed.ok && parsed.value).toMatchObject({
      statut: "acceptee",
      titre: "PostgreSQL",
      date: "2026-11-21",
    });
    expect(changes(plan([op("adr.delete", "ADR-001")], files))).toEqual([{ path, delete: true }]);
    expect(plan([op("adr.update", "ADR-009", { status: "acceptee" })], files)).toEqual({
      outcome: { status: "conflict", errorCode: "write_conflict" },
    });
  });
});

describe("document : doc.section.create, update, delete", () => {
  const WITH_SECTION = [
    ...BASE,
    {
      path: "architecture/overview/01-contexte.md",
      content: "# Architecture : contexte\n\nÀ compléter.\n",
    },
  ];

  it("create prend le numéro suivant et écrit le statut en front matter (brouillon par défaut)", () => {
    const result = plan(
      [op("doc.section.create", "DOC-flux", { title: "Flux", markdown: "Texte." })],
      WITH_SECTION,
    );
    const path = "architecture/overview/02-flux.md";
    expect(paths(result)).toEqual([path]);
    expect(parseDocSection(contentOf(result, path) ?? "")).toEqual({
      title: "Flux",
      status: "brouillon",
      markdown: "Texte.",
    });
    const first = plan([
      op("doc.section.create", "DOC-flux", { title: "Flux", markdown: "T", status: "a_relire" }),
    ]);
    expect(paths(first)).toEqual(["architecture/overview/01-flux.md"]);
  });

  it("update par DOC-slug : titre, texte, statut ; delete retire le fichier ; absent ou pris : conflit", () => {
    const path = "architecture/overview/01-contexte.md";
    const updated = plan(
      [op("doc.section.update", "DOC-contexte", { status: "validee", markdown: "Fait." })],
      WITH_SECTION,
    );
    expect(parseDocSection(contentOf(updated, path) ?? "")).toEqual({
      title: "Architecture : contexte",
      status: "validee",
      markdown: "Fait.",
    });
    expect(changes(plan([op("doc.section.delete", "DOC-contexte")], WITH_SECTION))).toEqual([
      { path, delete: true },
    ]);
    const conflict = { outcome: { status: "conflict", errorCode: "write_conflict" } };
    expect(
      plan([op("doc.section.create", "DOC-contexte", { title: "x", markdown: "y" })], WITH_SECTION),
    ).toEqual(conflict);
    expect(
      plan([op("doc.section.update", "DOC-absente", { status: "validee" })], WITH_SECTION),
    ).toEqual(conflict);
  });
});

/** TK-114e (B671) : conflits par l'index partagé ; tout le lot refusé, double création comprise. */
describe("conflits d'un lot (TK-114e)", () => {
  const conflict = { outcome: { status: "conflict", errorCode: "write_conflict" } };
  const TACHES = "architecture/overview/04-taches-modeles-de-taches-et-cycle-de-vie.md";
  const withTaches = [
    ...BASE,
    { path: TACHES, content: "---\nstatut: brouillon\n---\n# Tâches\n\nTexte.\n" },
  ];

  it("une doc.section.create dont l'identifiant existe refuse tout le lot (write_conflict)", () => {
    const operations = [
      op("component.create", "C-base", COMPONENT),
      op("doc.section.create", "DOC-taches-modeles-de-taches-et-cycle-de-vie", {
        title: "Tâches, modèles de tâches et cycle de vie",
        markdown: "Autre texte.",
      }),
    ];
    expect(plan(operations, withTaches)).toEqual(conflict);
  });

  it("deux component.create du même identifiant : write_conflict", () => {
    const operations = [
      op("component.create", "C-base", COMPONENT),
      op("component.create", "C-base", { ...COMPONENT, responsibility: "Autre." }),
    ];
    expect(plan(operations)).toEqual(conflict);
  });

  it("un lot sans conflit est écrit comme avant", () => {
    expect(paths(plan([op("component.create", "C-base", COMPONENT)], withTaches))).toEqual([
      "architecture/components/base.yaml",
      "architecture/schema.mmd",
    ]);
  });
});

describe("intégrité des opérations", () => {
  const batch = (kind: string, targetSpecId: string | null) => ({
    branch: "cadrage",
    repo: { specPath: null },
    operations: [op(kind, targetSpecId)],
  });
  it("les douze genres sont connus, identifiants au bon motif", () => {
    const ok = [
      ["component.create", "C-api"],
      ["component.delete", "C-api"],
      ["archflow.update", "P-reserver"],
      ["adr.update", "ADR-001"],
      ["doc.section.delete", "DOC-contexte"],
    ] as const;
    for (const [kind, id] of ok) {
      expect(integrityProblem(batch(kind, id) as never), kind).toBeUndefined();
    }
    expect(integrityProblem(batch("component.create", "T-api") as never)).toBe("specId");
    expect(integrityProblem(batch("adr.create", "ADR-1") as never)).toBe("specId");
    expect(integrityProblem(batch("doc.section.create", "contexte") as never)).toBe("specId");
    expect(integrityProblem(batch("archflow.create", "C-api") as never)).toBe("specId");
  });
});
