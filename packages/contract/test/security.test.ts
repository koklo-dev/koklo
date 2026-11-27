import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION, generateOpenApi } from "../src/index.ts";
import { errors, input, isValid, output, parsed, proc, SHA, UUID } from "./support.ts";

/**
 * TK-117 lot B (contrat 3.19.0, additif, B790 à B818) : groupe `security`, opérations de lot, vue client et contact,
 * types de panneau et de préremplissage, refus de validation, cible de commentaire et impact amont.
 */
const doc = async () =>
  (await generateOpenApi()) as {
    paths: Record<string, Record<string, unknown>>;
    info: { version: string };
  };

const base = { projectId: UUID };
const write = { ...base, idempotencyKey: "secu-1" };
const BASE = "/projects/{projectId}/spec/security";

const ROUTES = [
  ["security.threat.list", "get", `${BASE}/threats`],
  ["security.threat.create", "post", `${BASE}/threats`],
  ["security.threat.byId", "get", `${BASE}/threats/{threatId}`],
  ["security.threat.update", "post", `${BASE}/threats/{threatId}`],
  ["security.data.list", "get", `${BASE}/data`],
  ["security.data.classify", "post", `${BASE}/data`],
  ["security.registry.export", "get", `${BASE}/data/registry`],
  ["security.rights.get", "get", `${BASE}/rights`],
  ["security.asvs.report", "get", `${BASE}/asvs`],
  ["security.asvs.setLevel", "post", `${BASE}/asvs/level`],
  ["security.summary.get", "get", `${BASE}/summary`],
  ["security.summary.propose", "post", `${BASE}/summary/proposals`],
  ["security.summary.accept", "post", `${BASE}/summary/accept`],
  ["security.validate", "post", `${BASE}/validate`],
  ["clientSpace.security", "get", "/client-space/projects/{projectId}/security"],
  ["clientSpace.securityContactSet", "post", "/client-space/projects/{projectId}/security/contact"],
] as const;

describe("TK-117 surface", () => {
  it("version 3.20.0 (additif : mineure)", async () => {
    expect(CONTRACT_VERSION).toBe("3.20.0");
    expect((await doc()).info.version).toBe("3.20.0");
  });

  it.each(ROUTES)("%s : %s %s, 401, 403 et 404", async (name, method, path) => {
    expect(proc(name), name).toBeDefined();
    expect((await doc()).paths[path]?.[method], path).toBeDefined();
    // La vue client est lue par les six rôles : pas de FORBIDDEN, comme les autres lectures de l'espace client.
    const refusals = name === "clientSpace.security" ? [] : ["FORBIDDEN"];
    expect(Object.keys(errors(name))).toEqual(
      expect.arrayContaining(["UNAUTHORIZED", "NOT_FOUND", ...refusals]),
    );
  });

  it("la vue client ne porte ni chemin, ni SHA, ni YAML", async () => {
    const route = (await doc()).paths["/client-space/projects/{projectId}/security"];
    expect(route?.get).toBeDefined();
    expect(JSON.stringify(route)).not.toMatch(/yaml|filePath|commitSha/i);
  });

  it("« Valider » refuse par 409 threats_open ou data_unclassified (validate et review.submit)", async () => {
    for (const name of ["security.validate", "review.submit"]) {
      const schema = errors(name).CONFLICT?.data;
      for (const reason of ["threats_open", "data_unclassified"]) {
        expect(await isValid(schema, { reason }), `${name} ${reason}`).toBe(true);
      }
    }
  });
});

const threat = {
  title: "Export du fichier clients",
  surfaces: ["F-012", "api"],
  category: "data_leak",
  severity: "high",
  risk: "Un compte volé exporte tout.\nPuis le revend.",
  verification: "scenario",
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même famille, un test par cas
describe("TK-117 menaces", () => {
  it("liste : filtres fermés, limite, around exclut le curseur", async () => {
    const schema = input("security.threat.list");
    for (const filter of ["high", "todo", "ci"]) {
      expect(await isValid(schema, { ...base, filter, limit: "50", q: "export" })).toBe(true);
    }
    expect(await isValid(schema, { ...base, around: "SEC-T08" })).toBe(true);
    expect(await isValid(schema, { ...base, filter: "low" })).toBe(false);
    expect(await isValid(schema, { ...base, around: "SEC-T08", cursor: "x" })).toBe(false);
    expect(await isValid(schema, { ...base, around: "../secret" })).toBe(false);
  });

  it("création et modification : champs bornés, une ligne par champ sauf le risque", async () => {
    const create = input("security.threat.create");
    const full = {
      ...write,
      ...threat,
      measures: ["Second facteur."],
      verificationDetail: "Détection",
      scenario: { when: "le compte exporte", expected: "un second facteur est demandé" },
      links: ["client.export", "RL-gerante", "clients.telephone", "NFR-001"],
      branch: "cadrage",
      baseSha: SHA,
    };
    expect(await isValid(create, full)).toBe(true);
    for (const over of [
      { title: "a\n# titre" },
      { measures: ["a\n  Scénario: x"] },
      { scenario: { when: "a\nAlors b", expected: "c" } },
      { surfaces: [] },
      { surfaces: ["../x"] },
      { severity: "critical" },
      { links: ["../etc/passwd"] },
    ]) {
      expect(await isValid(create, { ...full, ...over }), JSON.stringify(over)).toBe(false);
    }
    const update = input("security.threat.update");
    expect(await isValid(update, { ...write, threatId: "SEC-T01", severity: "low" })).toBe(true);
    expect(await isValid(update, { ...write, threatId: "SEC-T01" })).toBe(false);
    expect(await isValid(update, { ...write, threatId: "../x", severity: "low" })).toBe(false);
  });

  it("liste et fiche : sorties de la page", async () => {
    const summary = {
      id: "SEC-T08",
      title: "Export",
      surface: "F-012",
      surfaces: ["F-012"],
      category: "data_leak",
      severity: "high",
      status: "todo",
      verification: "scenario",
    };
    const page = {
      items: [summary],
      nextCursor: null,
      previousCursor: null,
      offset: 0,
      total: 1,
      facets: { status: { total: 1, todo: 1, todoHigh: 1, high: 1 }, surface: { "F-012": 1 } },
      surfaces: [{ id: "F-012", title: "Fichier clients" }],
    };
    expect(await isValid(output("security.threat.list"), page)).toBe(true);
    const detail = {
      ...summary,
      surfaceTitles: [{ id: "F-012", title: "Fichier clients" }],
      risk: "r",
      measures: [],
      links: ["client.export"],
      gherkin: "# language: fr\n",
      scenarioPath: "quality/scenarios/abuse/SEC-T08.feature",
      filePath: "security/threats/SEC-T08.yaml",
      commitSha: SHA,
    };
    expect(await isValid(output("security.threat.byId"), detail)).toBe(true);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même famille, un test par cas
describe("TK-117 données, droits, exigences et résumé", () => {
  it("données : filtres, lignes non classées, contexte", async () => {
    const list = input("security.data.list");
    expect(await isValid(list, { ...base, category: "sensitive", undecided: "true" })).toBe(true);
    expect(await isValid(list, { ...base, around: "clients.telephone" })).toBe(true);
    expect(await isValid(list, { ...base, category: "sante" })).toBe(false);
    const page = {
      items: [
        { field: "clients.nom", fields: ["clients.nom"], access: [], status: "unclassified" },
      ],
      nextCursor: null,
      previousCursor: null,
      offset: 0,
      total: 1,
      context: { hosting: [], subprocessors: [], transfers: null },
    };
    expect(await isValid(output("security.data.list"), page)).toBe(true);
  });

  it("classer : champ ou table, conservation humaine facultative", async () => {
    const classify = input("security.data.classify");
    const entry = { ...write, data: "Téléphone", fields: ["clients"], category: "contact" };
    expect(await isValid(classify, entry)).toBe(true);
    expect(await isValid(classify, { ...entry, retention: "3 ans" })).toBe(true);
    expect(await isValid(classify, { ...write, id: "clients.telephone", retention: "" })).toBe(
      true,
    );
    expect(await isValid(classify, { ...entry, fields: ["../data"] })).toBe(false);
    expect(await isValid(classify, { ...entry, data: "a\n|b" })).toBe(false);
    expect(await isValid(classify, { ...write, data: "Sans champ" })).toBe(false);
  });

  it("registre, matrice, niveau et rapport ASVS", async () => {
    expect(
      await isValid(output("security.registry.export"), {
        filename: "registre-rgpd-salon.md",
        markdown: "# Registre",
      }),
    ).toBe(true);
    const matrix = {
      roles: [{ id: "RL-accueil", name: "Accueil" }],
      actions: [
        {
          id: "PM-client.lire",
          label: "Lire",
          cells: [{ role: "RL-accueil", access: "restricted", restriction: "les siens" }],
        },
      ],
      restrictions: [],
      ownershipRules: [],
      abuseScenarios: 1,
      commitSha: null,
    };
    expect(await isValid(output("security.rights.get"), matrix)).toBe(true);
    const level = input("security.asvs.setLevel");
    expect(await isValid(level, { ...write, level: 3 })).toBe(true);
    expect(await isValid(level, { ...write, level: 4 })).toBe(false);
    const report = {
      level: 2,
      recommendedLevel: 2,
      chosen: false,
      chapters: [{ chapter: "sessions", answered: 0, total: 0, where: [], status: "to_check" }],
      answered: 0,
      total: 0,
      facts: [],
      commitSha: null,
    };
    expect(await isValid(output("security.asvs.report"), report)).toBe(true);
  });

  it("résumé : lecture avec contact, proposition par le circuit commun, acceptation", async () => {
    const read = {
      available: true,
      cards: [{ key: "retention", title: "Combien de temps on garde", text: "À décider" }],
      commitSha: SHA,
      contact: { name: "Marie", phone: "06 00 00 00 00" },
    };
    expect(await isValid(output("security.summary.get"), read)).toBe(true);
    expect(await isValid(input("security.summary.propose"), base)).toBe(true);
    expect(await isValid(input("security.summary.accept"), { ...write, proposalId: UUID })).toBe(
      true,
    );
    expect(await isValid(input("security.validate"), { ...base, version: SHA })).toBe(true);
    expect(await isValid(input("security.validate"), base)).toBe(false);
  });

  it("vue client : vide si non validé, contact au format téléphone", async () => {
    const empty = { available: false, validation: "to_validate", cards: [] };
    expect(await isValid(output("clientSpace.security"), empty)).toBe(true);
    const set = input("clientSpace.securityContactSet");
    const contact = { ...base, name: "Marie Exemple", phone: "+33 6 00 00 00 00" };
    expect(await isValid(set, contact)).toBe(true);
    for (const over of [
      { name: "" },
      { name: "x".repeat(121) },
      { name: "a\nb" },
      { name: "   " },
      { phone: "appelez-moi" },
      { phone: "0".repeat(41) },
      { phone: "" },
    ]) {
      expect(await isValid(set, { ...contact, ...over }), JSON.stringify(over)).toBe(false);
    }
  });
});

const submit = (operations: unknown[]) =>
  isValid(input("specBatch.submit"), { ...write, operations });

describe("TK-117 opérations de lot", () => {
  it.each([
    { kind: "threat.create", ...threat },
    { kind: "threat.update", specId: "SEC-T01", measures: ["x"] },
    { kind: "threat.delete", specId: "SEC-T01" },
    { kind: "sensitive.create", data: "Note", fields: ["reservations.note"], category: "contact" },
    { kind: "sensitive.update", specId: "reservations.note", retention: "1 an" },
    { kind: "sensitive.delete", specId: "reservations.note" },
    { kind: "right.create", role: "RL-accueil", permission: "PM-client.lire", restriction: "x" },
    { kind: "right.create", ownershipRule: "Chacun voit les siens." },
    { kind: "right.delete", ownershipRule: "Chacun voit les siens." },
    { kind: "asvs.set_level", level: 2 },
    { kind: "asvs.create", chapter: "sessions", title: "Expiration", level: 1, answer: "30 min" },
    { kind: "asvs.update", requirementId: "EX-001", answer: "30 jours" },
    { kind: "asvs.update", facts: [{ label: "Secrets", value: "Coffre" }] },
    { kind: "summary.update", incident: "Nous vous prévenons sous 24 heures." },
    { kind: "doc.section.create", deliverable: "security", title: "Objet", markdown: "x" },
  ])("accepte $kind", async (operation) => {
    expect(await submit([operation])).toBe(true);
  });

  it.each([
    { kind: "threat.update", specId: "SEC-T01" },
    { kind: "sensitive.update", specId: "reservations.note" },
    { kind: "right.create", role: "RL-accueil", restriction: "x" },
    {
      kind: "right.create",
      role: "RL-accueil",
      permission: "PM-client.lire",
      restriction: "x",
      ownershipRule: "y",
    },
    { kind: "right.create" },
    { kind: "asvs.update", requirementId: "EX-001" },
    { kind: "asvs.update", requirementId: "EX-001", facts: [{ label: "a", value: "b" }] },
    { kind: "asvs.update", requirementId: "../x", answer: "a" },
    { kind: "summary.update" },
    { kind: "summary.update", location: "## Titre" },
  ])("refuse $kind mal formé", async (operation) => {
    expect(await submit([operation])).toBe(false);
  });

  it("le lot rapporte menaces, champs classés et opérations sans cible", async () => {
    const batch = {
      id: UUID,
      branch: "cadrage",
      status: "queued",
      idempotencyKey: "secu-1",
      baseSha: null,
      commitSha: null,
      errorCode: null,
      report: null,
      results: [
        { position: 0, kind: "threat.create", specId: "SEC-T01" },
        { position: 1, kind: "sensitive.update", specId: "clients._id" },
        { position: 2, kind: "summary.update", specId: null },
      ],
      enqueuedAt: "2026-11-27T10:00:00.000Z",
      committedAt: null,
    };
    expect(await isValid(output("specBatch.get"), batch)).toBe(true);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même famille, un test par cas
describe("TK-117 circuits partagés", () => {
  it("modes et types de proposition", async () => {
    const propose = input("ai.proposeDeliverable");
    for (const mode of ["threats", "classify", "asvs", "summary"]) {
      expect(await isValid(propose, { ...base, deliverable: "security", mode })).toBe(true);
    }
    const proposal = {
      id: UUID,
      launchId: UUID,
      zone: "z",
      position: 0,
      title: "t",
      rationale: "r",
      content: {},
      status: "pending",
      appliedBatchId: null,
      createdAt: "2026-11-27T10:00:00.000Z",
    };
    for (const kind of ["threat", "sensitive", "right", "asvs", "summary"]) {
      const page = {
        items: [{ ...proposal, kind }],
        nextCursor: null,
        previousCursor: null,
        offset: 0,
        total: 1,
        groups: [],
        launch: null,
      };
      expect(await isValid(output("proposal.list"), page), kind).toBe(true);
    }
  });

  it("panneau et préremplissage : menace et donnée, jamais de conservation préremplie", async () => {
    const item = input("spec.item.get");
    expect(await isValid(item, { ...base, type: "threat", id: "SEC-T01" })).toBe(true);
    expect(await isValid(item, { ...base, type: "sensitive", id: "clients.telephone" })).toBe(true);
    expect(await isValid(item, { ...base, type: "sensitive", id: "SEC-T01" })).toBe(false);
    for (const type of ["threat", "sensitive"]) {
      expect(await isValid(input("ai.prefillItem"), { ...base, type, description: "d" })).toBe(
        true,
      );
    }
    const prefilled = await parsed(output("ai.prefillItem"), {
      type: "sensitive",
      values: { field: "clients.telephone", retention: "3 ans", retentionSuggestion: "3 ans" },
    });
    expect(prefilled?.values).toEqual({
      field: "clients.telephone",
      retentionSuggestion: "3 ans",
    });
  });

  it("commentaire du résumé, sections du dossier et impact amont borné", async () => {
    const create = input("comment.create");
    const target = { ...base, targetKind: "security_summary", body: "Question ?" };
    expect(await isValid(create, { ...target, targetRef: "summary" })).toBe(true);
    expect(await isValid(create, { ...target, targetRef: "SEC-T01" })).toBe(false);
    expect(
      await isValid(input("spec.document.sections"), { ...base, deliverable: "security" }),
    ).toBe(true);
    const entry = {
      key: "security",
      status: "revise",
      available: true,
      forced: false,
      condition: null,
      pendingProposals: 0,
      staleSecurity: { changes: [{ id: "ST-sms", change: "changed" }], items: ["SEC-T02"] },
    };
    const list = (security: unknown) => ({ deliverables: [security], validatedCount: 0 });
    expect(await isValid(output("spec.deliverables"), list(entry))).toBe(true);
    const many = Array.from({ length: 51 }, (_, i) => `SEC-T${i + 10}`);
    expect(
      await isValid(
        output("spec.deliverables"),
        list({ ...entry, staleSecurity: { changes: [], items: many } }),
      ),
    ).toBe(false);
  });
});
