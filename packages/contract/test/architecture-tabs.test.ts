import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION, generateOpenApi } from "../src/index.ts";
import { errors, input, isValid, output, proc, UUID } from "./support.ts";

/**
 * TK-111 lot B (contrat 3.9.0, additif, B506 à B515) : opérations `component.*`, `archflow.*`, `adr.*`, `doc.section.*` de
 * `specBatch.submit`, lectures `spec.architecture.*`, `spec.item.get` de type `component`, compteur `components`.
 */
describe("TK-111 surface", () => {
  it("version 3.9.0", () => {
    expect(CONTRACT_VERSION).toBe("3.9.0");
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
