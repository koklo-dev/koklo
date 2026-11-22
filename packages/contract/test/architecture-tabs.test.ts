import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION, generateOpenApi } from "../src/index.ts";
import { errors, input, isValid, output, proc, SHA, UUID } from "./support.ts";

/**
 * TK-111 lot B (contrat 3.9.0, additif, B506 à B515) : opérations `component.*`, `archflow.*`, `adr.*`, `doc.section.*` de
 * `specBatch.submit`, lectures `spec.architecture.*`, `spec.item.get` de type `component`, compteur `components`.
 */
describe("TK-111 surface", () => {
  it("version 3.13.0 (TK-113 est additif : mineure)", () => {
    expect(CONTRACT_VERSION).toBe("3.13.0");
  });

  it.each([
    ["spec.architecture.components.list", "/projects/{projectId}/spec/architecture/components"],
    ["spec.architecture.document", "/projects/{projectId}/spec/architecture/document"],
    ["spec.architecture.checks", "/projects/{projectId}/spec/architecture/checks"],
  ])(
    "%s : GET %s, 403 pour client et business, jamais de YAML ni de Mermaid",
    async (name, path) => {
      expect(proc(name), name).toBeDefined();
      const doc = (await generateOpenApi()) as { paths: Record<string, Record<string, unknown>> };
      expect(doc.paths[path]?.get, path).toBeDefined();
      expect(Object.keys(errors(name))).toEqual(
        expect.arrayContaining(["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "VALIDATION"]),
      );
      expect(JSON.stringify(doc.paths[path])).not.toMatch(/yaml|mermaid/i);
    },
  );
});

const batch = (operations: unknown[]) => ({ projectId: UUID, idempotencyKey: "k-1", operations });
const ok = async (operation: unknown) => isValid(input("specBatch.submit"), batch([operation]));

describe("TK-111 specBatch.submit : component.*", () => {
  const component = {
    kind: "component.create",
    name: "API",
    type: "service",
    zone: "Coeur",
    responsibility: "Expose les procédures.",
    owns: ["T-client"],
    serves: ["F-001"],
    dependsOn: [
      { to: "C-db", via: "SQL" },
      { to: "C-file", via: "AMQP", async: true },
    ],
    decisions: ["ADR-001"],
  };

  it("component.create : nom, type, zone et responsabilité suffisent ; type du vocabulaire fermé", async () => {
    expect(await ok(component)).toBe(true);
    expect(
      await ok({
        kind: "component.create",
        name: "A",
        type: "app",
        zone: "Z",
        responsibility: "R",
      }),
    ).toBe(true);
    for (const type of ["app", "service", "store", "queue", "ext"]) {
      expect(await ok({ ...component, type }), type).toBe(true);
    }
    expect(await ok({ ...component, type: "lambda" })).toBe(false);
    expect(await ok({ ...component, zone: undefined })).toBe(false);
    expect(await ok({ ...component, name: "" })).toBe(false);
  });

  it("liens : tables T-slug, fonctionnalités F-nnn, dépendances vers C-slug, décisions ADR-nnn", async () => {
    expect(await ok({ ...component, owns: ["client"] })).toBe(false);
    expect(await ok({ ...component, serves: ["T-client"] })).toBe(false);
    expect(await ok({ ...component, dependsOn: [{ to: "db", via: "SQL" }] })).toBe(false);
    expect(await ok({ ...component, dependsOn: [{ to: "C-db" }] })).toBe(false);
    expect(await ok({ ...component, decisions: ["ADR-1"] })).toBe(false);
  });

  it("component.update et component.delete : identifiant C-slug, au moins un champ modifié", async () => {
    expect(await ok({ kind: "component.update", specId: "C-api", zone: "Bord" })).toBe(true);
    expect(await ok({ kind: "component.update", specId: "C-api" })).toBe(false);
    expect(await ok({ kind: "component.update", specId: "T-api", zone: "Bord" })).toBe(false);
    expect(await ok({ kind: "component.delete", specId: "C-api" })).toBe(true);
    expect(await ok({ kind: "component.delete", specId: "F-001" })).toBe(false);
  });
});

describe("TK-114b specBatch.submit : liens d'un composant (B615)", () => {
  const component = {
    kind: "component.create",
    name: "API",
    type: "service",
    zone: "Coeur",
    responsibility: "Expose les procédures.",
  };
  it("TK-114b (B615) : owns et serves jusqu'à 200 liens, en création comme en mise à jour", async () => {
    const tables = (n: number) => Array.from({ length: n }, (_, i) => `T-table-${i}`);
    const features = (n: number) =>
      Array.from({ length: n }, (_, i) => `F-${String(i + 1).padStart(3, "0")}`);
    const update = { kind: "component.update", specId: "C-base-de-donnees" };
    expect(await ok({ ...component, owns: tables(200), serves: features(200) })).toBe(true);
    expect(await ok({ ...update, owns: tables(200), serves: features(200) })).toBe(true);
    expect(await ok({ ...component, owns: tables(201) })).toBe(false);
    expect(await ok({ ...update, serves: features(201) })).toBe(false);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même livrable, un test par comportement
describe("TK-111 specBatch.submit : archflow.*, adr.*, doc.section.*", () => {
  const flow = {
    kind: "archflow.create",
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
  };
  it("archflow.create : P-slug du parcours, participants C- ou RL-, blocs alt et séparateur", async () => {
    expect(await ok(flow)).toBe(true);
    expect(await ok({ ...flow, flow: "reserver" })).toBe(false);
    expect(await ok({ ...flow, participants: ["C-api"] })).toBe(false);
    expect(await ok({ ...flow, participants: ["C-api", "T-x"] })).toBe(false);
    expect(await ok({ ...flow, messages: [] })).toBe(false);
    expect(await ok({ ...flow, messages: [{ block: "loop", label: "x" }] })).toBe(false);
  });

  it("archflow.update et archflow.delete visent un P-slug", async () => {
    expect(await ok({ kind: "archflow.update", specId: "P-reserver", features: ["F-001"] })).toBe(
      true,
    );
    expect(await ok({ kind: "archflow.update", specId: "P-reserver" })).toBe(false);
    expect(await ok({ kind: "archflow.delete", specId: "P-reserver" })).toBe(true);
    expect(await ok({ kind: "archflow.delete", specId: "C-api" })).toBe(false);
  });

  const adr = {
    kind: "adr.create",
    title: "PostgreSQL",
    context: "Il faut une base.",
    decision: "PostgreSQL 17.",
    alternatives: [{ name: "MySQL", reason: "Moins de types" }],
  };
  it("adr.create : titre, contexte et décision ; adr.update et adr.delete visent un ADR-nnn", async () => {
    expect(await ok(adr)).toBe(true);
    expect(await ok({ ...adr, links: ["C-db", "T-client", "F-001", "R-001", "P-x"] })).toBe(true);
    expect(await ok({ ...adr, links: ["X-1"] })).toBe(false);
    expect(await ok({ ...adr, title: undefined })).toBe(false);
    expect(await ok({ kind: "adr.update", specId: "ADR-001", status: "acceptee" })).toBe(true);
    expect(await ok({ kind: "adr.update", specId: "ADR-001", status: "inconnu" })).toBe(false);
    expect(await ok({ kind: "adr.update", specId: "ADR-1", status: "acceptee" })).toBe(false);
    expect(await ok({ kind: "adr.delete", specId: "ADR-001" })).toBe(true);
  });

  it("doc.section.* : titre et texte à la création, DOC-slug ensuite, statut fermé", async () => {
    const create = { kind: "doc.section.create", title: "Contexte", markdown: "Texte." };
    expect(await ok(create)).toBe(true);
    expect(await ok({ ...create, status: "a_relire" })).toBe(true);
    expect(await ok({ ...create, status: "fini" })).toBe(false);
    expect(await ok({ ...create, markdown: "" })).toBe(false);
    expect(
      await ok({ kind: "doc.section.update", specId: "DOC-contexte", status: "validee" }),
    ).toBe(true);
    expect(await ok({ kind: "doc.section.update", specId: "DOC-contexte" })).toBe(false);
    expect(await ok({ kind: "doc.section.update", specId: "contexte", title: "X" })).toBe(false);
    expect(await ok({ kind: "doc.section.delete", specId: "DOC-contexte" })).toBe(true);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même livrable, un test par comportement
describe("TK-111 lectures", () => {
  it("components.list : pages à curseur (q, zone, around C-slug), around exclut cursor", async () => {
    const i = input("spec.architecture.components.list");
    expect(await isValid(i, { projectId: UUID })).toBe(true);
    expect(await isValid(i, { projectId: UUID, q: "api", zone: "Coeur", limit: "50" })).toBe(true);
    expect(await isValid(i, { projectId: UUID, around: "C-api" })).toBe(true);
    expect(await isValid(i, { projectId: UUID, around: "api" })).toBe(false);
    expect(await isValid(i, { projectId: UUID, around: "C-api", cursor: "x" })).toBe(false);
    expect(await isValid(i, { projectId: UUID, branch: "a", commitSha: "a".repeat(40) })).toBe(
      false,
    );
    const item = {
      specId: "C-api",
      name: "API",
      type: "service",
      zone: "Coeur",
      responsibility: "Expose.",
      dependsOnCount: 2,
      decisions: ["ADR-001"],
      filePath: "architecture/components/api.yaml",
    };
    const page = { items: [item], nextCursor: null, previousCursor: null, offset: 0, total: 1 };
    expect(await isValid(output("spec.architecture.components.list"), page)).toBe(true);
    expect(
      await isValid(output("spec.architecture.components.list"), {
        ...page,
        items: [{ ...item, type: "lambda" }],
      }),
    ).toBe(false);
  });

  it("document : sections ordonnées avec statut fermé ; checks : six codes d'avertissement", async () => {
    const section = {
      specId: "DOC-contexte",
      slug: "contexte",
      num: 1,
      path: "architecture/overview/01-contexte.md",
      title: "Contexte",
      status: "brouillon",
      markdown: "Texte.",
      updatedAt: null,
      lastAuthor: null,
    };
    const document = { sections: [section], commitSha: "a".repeat(40) };
    expect(await isValid(output("spec.architecture.document"), document)).toBe(true);
    expect(
      await isValid(output("spec.architecture.document"), {
        ...document,
        sections: [{ ...section, status: "fini" }],
      }),
    ).toBe(false);
    for (const code of [
      "ARCH_TABLE_UNOWNED",
      "ARCH_TABLE_MULTI_OWNER",
      "ARCH_EXT_OWNS_TABLE",
      "ARCH_FEATURE_UNSERVED",
      "ARCH_FLOW_MISSING",
      "ARCH_SYNC_CYCLE",
    ]) {
      expect(
        await isValid(output("spec.architecture.checks"), {
          warnings: [{ code, entityId: "C-api", message: "m" }],
        }),
        code,
      ).toBe(true);
    }
    expect(
      await isValid(output("spec.architecture.checks"), {
        warnings: [{ code: "AUTRE", entityId: "C-api", message: "m" }],
      }),
    ).toBe(false);
  });

  it("spec.item.get : type component (C-slug) ; spec.head.counts : components", async () => {
    expect(
      await isValid(input("spec.item.get"), { projectId: UUID, type: "component", id: "C-api" }),
    ).toBe(true);
    expect(
      await isValid(input("spec.item.get"), { projectId: UUID, type: "component", id: "T-api" }),
    ).toBe(false);
    const detail = {
      type: "component",
      id: "C-api",
      values: {
        specId: "C-api",
        name: "API",
        type: "service",
        zone: "Coeur",
        responsibility: "Expose.",
        owns: [],
        serves: [],
        dependsOn: [],
        decisions: [],
        filePath: "architecture/components/api.yaml",
        commitSha: "a".repeat(40),
      },
      validated: false,
      referencedBy: { items: [], total: 0 },
    };
    expect(await isValid(output("spec.item.get"), detail)).toBe(true);
  });

  it("ai.proposeDeliverable : modes decision et document, types de proposition de l'architecture", async () => {
    const i = input("ai.proposeDeliverable");
    for (const mode of ["complete", "decision", "document", "all"]) {
      expect(await isValid(i, { projectId: UUID, deliverable: "architecture", mode }), mode).toBe(
        true,
      );
    }
  });
});

/** TK-112 lot A (contrat 3.10.0, additif, B542 à B545) : schéma en couches et flux en séquence, lectures et mise en page. */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe("TK-112 A spec.architecture : zones, zone, search, layout, flows, source", () => {
  const base = "/projects/{projectId}/spec/architecture";
  const POSITIONS = { "C-api": { x: 10, y: 20 }, "RL-client": { x: 0, y: 8 } };

  it.each([
    ["spec.architecture.zones", `${base}/zones`],
    ["spec.architecture.zone", `${base}/zone`],
    ["spec.architecture.search", `${base}/search`],
    ["spec.architecture.layout.get", `${base}/layout`],
    ["spec.architecture.flows.list", `${base}/flows`],
    ["spec.architecture.flows.byId", `${base}/flows/{flowId}`],
    ["spec.architecture.source", `${base}/source`],
  ])("%s : GET %s, 401, 403, 404, VALIDATION, SPEC_INDEX_FAILED", async (name, path) => {
    expect(proc(name), name).toBeDefined();
    const doc = (await generateOpenApi()) as { paths: Record<string, Record<string, unknown>> };
    expect(doc.paths[path]?.get, path).toBeDefined();
    expect(Object.keys(errors(name))).toEqual(
      expect.arrayContaining(["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "VALIDATION"]),
    );
    expect(Object.keys(errors(name))).toContain("SPEC_INDEX_FAILED");
  });

  it("layout.save : POST sur le même chemin, erreurs d'écriture d'un lot", async () => {
    const doc = (await generateOpenApi()) as { paths: Record<string, Record<string, unknown>> };
    expect(doc.paths[`${base}/layout`]?.post).toBeDefined();
    expect(Object.keys(errors("spec.architecture.layout.save"))).toEqual(
      expect.arrayContaining([
        "UNAUTHORIZED",
        "FORBIDDEN",
        "NOT_FOUND",
        "VALIDATION",
        "SPEC_INVALID",
      ]),
    );
  });

  it("zones : révision exclusive ; sortie = zones (aperçu 7 au plus, liens, acteurs), total et commit", async () => {
    const i = input("spec.architecture.zones");
    expect(await isValid(i, { projectId: UUID })).toBe(true);
    expect(await isValid(i, { projectId: UUID, branch: "main", commitSha: SHA })).toBe(false);
    const zone = {
      id: "coeur",
      name: "Coeur",
      icon: "hub",
      componentCount: 3,
      actorCount: 2,
      preview: ["API"],
      links: [{ to: "donnees", count: 2 }],
    };
    const o = output("spec.architecture.zones");
    expect(await isValid(o, { zones: [zone], componentCount: 3, commitSha: SHA })).toBe(true);
    const long = Array.from({ length: 8 }, (_, n) => `C${n}`);
    expect(
      await isValid(o, {
        zones: [{ ...zone, preview: long }],
        componentCount: 3,
        commitSha: SHA,
      }),
    ).toBe(false);
    expect(
      await isValid(o, {
        zones: [{ ...zone, actorCount: undefined }],
        componentCount: 3,
        commitSha: SHA,
      }),
    ).toBe(false);
  });

  it("zone : identifiant de zone requis ; sortie = composants (200 au plus), liens, acteurs, truncated", async () => {
    const i = input("spec.architecture.zone");
    expect(await isValid(i, { projectId: UUID, zone: "coeur" })).toBe(true);
    expect(await isValid(i, { projectId: UUID })).toBe(false);
    const view = {
      zone: { id: "coeur", name: "Coeur", icon: "hub", componentCount: 1 },
      components: [{ specId: "C-api", name: "API", type: "service", responsibility: "Expose" }],
      relations: [{ from: "C-api", to: "C-db", via: "SQL" }],
      actors: [{ id: "RL-client", name: "Client" }],
      outgoing: [{ zone: "donnees", count: 1 }],
      crossRelations: [{ from: "C-api", to: "C-db", via: "SQL", zone: "donnees" }],
      truncated: false,
      commitSha: SHA,
    };
    const o = output("spec.architecture.zone");
    expect(await isValid(o, view)).toBe(true);
    expect(
      await isValid(o, {
        ...view,
        relations: [{ from: "C-api", to: "C-db", via: "AMQP", async: true }],
      }),
    ).toBe(true);
    // TK-114c (contrat 3.13.0, B640) : liens avec les autres zones, dans les deux sens, zone = l'autre zone.
    const cross = (crossRelations: unknown) => isValid(o, { ...view, crossRelations });
    expect(
      await cross([{ from: "C-job", to: "C-api", via: "AMQP", async: true, zone: "travaux" }]),
    ).toBe(true);
    expect(await cross([])).toBe(true);
    expect(await cross([{ from: "C-api", to: "C-db", via: "SQL" }])).toBe(false);
    expect(await cross([{ from: "api", to: "C-db", via: "SQL", zone: "donnees" }])).toBe(false);
    const { crossRelations: _cross, ...before } = view;
    expect(await isValid(o, before)).toBe(false);
    const many = Array.from({ length: 201 }, (_, n) => ({
      ...view.components[0],
      specId: `C-c${n}`,
    }));
    expect(await isValid(o, { ...view, components: many })).toBe(false);
    expect(
      await isValid(o, { ...view, components: [{ ...view.components[0], type: "lambda" }] }),
    ).toBe(false);
  });

  it("search : q de 1 à 100 caractères ; 20 résultats au plus", async () => {
    const i = input("spec.architecture.search");
    expect(await isValid(i, { projectId: UUID, q: "api" })).toBe(true);
    expect(await isValid(i, { projectId: UUID, q: "" })).toBe(false);
    expect(await isValid(i, { projectId: UUID, q: "x".repeat(101) })).toBe(false);
    const item = { specId: "C-api", name: "API", type: "service", zone: "Coeur" };
    const o = output("spec.architecture.search");
    expect(await isValid(o, { items: [item] })).toBe(true);
    expect(
      await isValid(o, {
        items: Array.from({ length: 21 }, (_, n) => ({ ...item, specId: `C-c${n}` })),
      }),
    ).toBe(false);
  });

  it("layout.get : positions C-slug ou RL-slug ; layout.save : entiers 0 à 20000, 500 au plus, clé d'idempotence", async () => {
    const get = output("spec.architecture.layout.get");
    expect(await isValid(get, { positions: POSITIONS, commitSha: SHA })).toBe(true);
    expect(await isValid(get, { positions: {}, commitSha: SHA })).toBe(true);
    const save = input("spec.architecture.layout.save");
    const body = (positions: unknown) => ({ projectId: UUID, idempotencyKey: "k-1", positions });
    expect(await isValid(save, body(POSITIONS))).toBe(true);
    expect(await isValid(save, body({}))).toBe(true);
    expect(await isValid(save, body({ "T-client": { x: 0, y: 0 } }))).toBe(false);
    expect(await isValid(save, body({ "C-a": { x: -1, y: 0 } }))).toBe(false);
    expect(await isValid(save, body({ "C-a": { x: 0, y: 20001 } }))).toBe(false);
    expect(await isValid(save, body({ "C-a": { x: 0.5, y: 0 } }))).toBe(false);
    const many = (count: number) =>
      Object.fromEntries(Array.from({ length: count }, (_, n) => [`C-c${n}`, { x: n, y: n }]));
    expect(await isValid(save, body(many(500)))).toBe(true);
    expect(await isValid(save, body(many(501)))).toBe(false);
    expect(await isValid(save, { projectId: UUID, positions: POSITIONS })).toBe(false);
    expect(await isValid(output("spec.architecture.layout.save"), { commitSha: null })).toBe(true);
    expect(await isValid(output("spec.architecture.layout.save"), { commitSha: SHA })).toBe(true);
  });

  it("l'opération architecture.layout.save est connue de specBatch.get mais pas soumissible", async () => {
    const stored = {
      id: UUID,
      branch: "cadrage",
      status: "committed",
      idempotencyKey: "k-1",
      baseSha: null,
      commitSha: SHA,
      errorCode: null,
      report: null,
      results: [{ position: 0, kind: "architecture.layout.save", specId: null }],
      enqueuedAt: "2026-11-21T10:00:00.000Z",
      committedAt: "2026-11-21T10:00:01.000Z",
    };
    expect(await isValid(output("specBatch.get"), stored)).toBe(true);
    expect(
      await isValid(input("specBatch.submit"), {
        projectId: UUID,
        idempotencyKey: "k-1",
        operations: [{ kind: "architecture.layout.save", positions: POSITIONS }],
      }),
    ).toBe(false);
  });

  it("flows.list : pages à curseur, q, around P-slug, révision exclusive ; ligne = parcours, acteur, comptes", async () => {
    const i = input("spec.architecture.flows.list");
    expect(await isValid(i, { projectId: UUID, q: "résa", limit: "50" })).toBe(true);
    expect(await isValid(i, { projectId: UUID, around: "P-reserver" })).toBe(true);
    expect(await isValid(i, { projectId: UUID, around: "C-api" })).toBe(false);
    expect(await isValid(i, { projectId: UUID, around: "P-a", cursor: "x" })).toBe(false);
    expect(await isValid(i, { projectId: UUID, branch: "b", commitSha: SHA })).toBe(false);
    const row = {
      specId: "P-reserver",
      title: "Réserver",
      actor: "Client",
      componentCount: 3,
      externalCount: 1,
    };
    const page = { items: [row], nextCursor: null, previousCursor: null, offset: 0, total: 1 };
    expect(await isValid(output("spec.architecture.flows.list"), page)).toBe(true);
    expect(
      await isValid(output("spec.architecture.flows.list"), {
        ...page,
        items: [{ ...row, actor: undefined }],
      }),
    ).toBe(false);
  });

  it("flows.byId : P-slug dans le chemin ; participants typés, éléments message, alt et séparateur, liens", async () => {
    const i = input("spec.architecture.flows.byId");
    expect(await isValid(i, { projectId: UUID, flowId: "P-reserver" })).toBe(true);
    expect(await isValid(i, { projectId: UUID, flowId: "C-api" })).toBe(false);
    const detail = {
      specId: "P-reserver",
      title: "Réserver",
      actor: "Client",
      participants: [
        { id: "RL-client", name: "Client", type: "actor" },
        { id: "C-api", name: "API", type: "service" },
        { id: "C-mail", name: "Courriel", type: "ext" },
      ],
      items: [
        { kind: "message", from: "RL-client", to: "C-api", text: "Réserve", reply: "OK" },
        {
          kind: "alt",
          label: "Si échec",
          messages: [{ from: "C-api", to: "RL-client", text: "Refus", error: "409" }],
        },
        { kind: "separator", label: "Plus tard" },
      ],
      features: ["F-001"],
      rules: ["R-001"],
      decisions: ["ADR-001"],
      filePath: "architecture/flows/P-reserver.yaml",
      commitSha: SHA,
    };
    const o = output("spec.architecture.flows.byId");
    expect(await isValid(o, detail)).toBe(true);
    for (const type of ["actor", "app", "service", "store", "queue", "ext"]) {
      expect(
        await isValid(o, {
          ...detail,
          participants: [{ id: "C-api", name: "API", type }],
        }),
        type,
      ).toBe(true);
    }
    expect(
      await isValid(o, { ...detail, participants: [{ id: "C-api", name: "API", type: "lambda" }] }),
    ).toBe(false);
    expect(await isValid(o, { ...detail, items: [{ kind: "note", label: "x" }] })).toBe(false);
  });

  it("source : composant, flux ou schéma ; identifiant requis sauf pour le schéma ; format de flux", async () => {
    const i = input("spec.architecture.source");
    const ok = (target: unknown, extra: object = {}) =>
      isValid(i, { projectId: UUID, target, ...extra });
    expect(await ok({ kind: "component", id: "C-api" })).toBe(true);
    expect(await ok({ kind: "flow", id: "P-reserver" })).toBe(true);
    expect(await ok({ kind: "flow", id: "P-reserver" }, { format: "mermaid" })).toBe(true);
    expect(await ok({ kind: "schema" })).toBe(true);
    expect(await ok({ kind: "component" })).toBe(false);
    expect(await ok({ kind: "component", id: "P-reserver" })).toBe(false);
    expect(await ok({ kind: "flow", id: "C-api" })).toBe(false);
    expect(await ok({ kind: "table", id: "T-a" })).toBe(false);
    expect(await ok({ kind: "flow", id: "P-a" }, { format: "pdf" })).toBe(false);
    expect(await ok({ kind: "schema" }, { branch: "b", commitSha: SHA })).toBe(false);
    expect(
      await isValid(output("spec.architecture.source"), {
        path: "architecture/schema.mmd",
        text: "flowchart LR\n",
        commitSha: SHA,
        generated: true,
      }),
    ).toBe(true);
    expect(await isValid(output("spec.architecture.source"), { text: "x" })).toBe(false);
  });

  it("spec.item.get accepte archflow (P-slug) et rend le détail du flux", async () => {
    const i = input("spec.item.get");
    expect(await isValid(i, { projectId: UUID, type: "archflow", id: "P-reserver" })).toBe(true);
    expect(await isValid(i, { projectId: UUID, type: "archflow", id: "C-api" })).toBe(false);
  });
});
