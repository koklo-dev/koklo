import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION, generateOpenApi } from "../src/index.ts";
import { errors, input, isValid, output, parsed, proc, SHA, UUID } from "./support.ts";

/**
 * TK-115 lot B (contrat 3.17.0, additif, B718 à B737) : cahier technique. Lectures `spec.technical.*`,
 * `spec.document.sections`, « Choisir », opérations `stack|op|nfr|env.*`, `clientSpace.technical*`, propositions,
 * préremplissage, commentaires et impact amont.
 */
const doc = async () =>
  (await generateOpenApi()) as {
    paths: Record<string, Record<string, unknown>>;
    info: { version: string };
  };

const batch = (operations: unknown[]) => ({ projectId: UUID, idempotencyKey: "k-1", operations });
const ok = (operation: unknown) => isValid(input("specBatch.submit"), batch([operation]));

describe("TK-115 surface", () => {
  it("version 3.17.0 (additif : mineure)", async () => {
    expect(CONTRACT_VERSION).toBe("3.17.0");
    expect((await doc()).info.version).toBe("3.17.0");
  });

  it.each([
    ["spec.technical.stack.list", "get", "/projects/{projectId}/spec/technical/stack"],
    [
      "spec.technical.stack.source",
      "get",
      "/projects/{projectId}/spec/technical/stack/{id}/source",
    ],
    [
      "spec.technical.stack.choose",
      "post",
      "/projects/{projectId}/spec/technical/stack/{id}/choose",
    ],
    ["spec.technical.environments", "get", "/projects/{projectId}/spec/technical/environments"],
    ["spec.document.sections", "get", "/projects/{projectId}/spec/document/sections"],
  ])("%s : %s %s, 403 et 404", async (name, method, path) => {
    expect(proc(name), name).toBeDefined();
    expect((await doc()).paths[path]?.[method], path).toBeDefined();
    expect(Object.keys(errors(name))).toEqual(
      expect.arrayContaining(["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "VALIDATION"]),
    );
  });

  it.each([
    ["clientSpace.technical", "/client-space/projects/{projectId}/technical"],
    ["clientSpace.technicalStack", "/client-space/projects/{projectId}/technical/stack"],
    [
      "clientSpace.technicalEnvironments",
      "/client-space/projects/{projectId}/technical/environments",
    ],
    ["clientSpace.technicalDocument", "/client-space/projects/{projectId}/technical/document"],
  ])("%s : GET %s, jamais de YAML ni de chemin", async (name, path) => {
    expect(proc(name), name).toBeDefined();
    const route = (await doc()).paths[path];
    expect(route?.get, path).toBeDefined();
    expect(JSON.stringify(route)).not.toMatch(/yaml|filePath|commitSha/i);
  });

  it("aucune lecture des opérations ni des exigences avant TK-116 (aucune route morte)", () => {
    expect(proc("spec.technical.ops.list")).toBeUndefined();
    expect(proc("spec.technical.nfr.list")).toBeUndefined();
  });
});

const stack = {
  kind: "stack.create",
  role: "Fournisseur SMS",
  status: "open",
  options: ["Brevo", "Twilio"],
  criteria: [{ label: "Prix", values: ["≈ 0,045 €", "≈ 0,07 €"] }],
  why: "Rappels.",
};
const operation = {
  kind: "op.create",
  name: "creneau.listAvailable",
  type: "read",
  zone: "Réservation",
  component: "C-api",
  summary: "Liste les créneaux.",
  permission: "public",
};
const nfr = {
  kind: "nfr.create",
  category: "performance",
  title: "Temps de réponse",
  target: "p95 < 300 ms",
  statement: "Les appels répondent vite.",
  verification: "ci_measure",
  links: ["C-api", "ST-api", "ADR-001", "R-001"],
};
const env = {
  kind: "env.create",
  name: "Recette",
  address: "recette.exemple.fr",
  hosting: "Hébergeur, Paris",
  database: "PostgreSQL géré",
  data: "anonymized",
  variables: [{ name: "DATABASE_URL", usage: "Connexion à la base" }],
  integrations: [{ service: "SMS", usage: "Rappels", status: "to_choose" }],
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même famille d'opérations, un test par cas
describe("TK-115 specBatch.submit : stack, op, nfr, env", () => {
  it.each([stack, operation, nfr, env])("$kind valide", async (valid) => {
    expect(await ok(valid)).toBe(true);
  });

  it("choix : « Choisir » est une stack.update ; critère sans valeurs admis ; deux options au moins", async () => {
    expect(
      await ok({ kind: "stack.update", specId: "ST-sms", status: "chosen", choice: "Brevo" }),
    ).toBe(true);
    expect(
      await ok({ kind: "stack.update", specId: "ST-sms", criteria: [{ label: "Prix" }] }),
    ).toBe(true);
    expect(await ok({ ...stack, options: ["Brevo"] })).toBe(false);
    expect(await ok({ kind: "stack.update", specId: "ST-sms" })).toBe(false);
    expect(await ok({ kind: "stack.delete", specId: "ST-sms" })).toBe(true);
  });

  it("opération : zone.verbe, jamais renommée ; permission publique, interne ou PM-", async () => {
    expect(await ok({ ...operation, name: "E-ancien" })).toBe(false);
    expect(await ok({ ...operation, permission: "PM-reservation.creer" })).toBe(true);
    expect(await ok({ ...operation, permission: "tous" })).toBe(false);
    expect(await ok({ kind: "op.update", specId: "liste_attente.list", summary: "Liste." })).toBe(
      true,
    );
    const renamed = await parsed(
      input("specBatch.submit"),
      batch([{ kind: "op.update", specId: "a.b", name: "c.d", summary: "x" }]),
    );
    expect(JSON.stringify(renamed)).not.toContain("c.d");
  });

  it("variables : le nom et l'usage seulement, une valeur n'est jamais gardée", async () => {
    const kept = await parsed(
      input("specBatch.submit"),
      batch([{ ...env, variables: [{ name: "TOKEN_API", usage: "x", value: "ne-pas-garder" }] }]),
    );
    expect(JSON.stringify(kept)).not.toContain("ne-pas-garder");
    expect(await ok({ ...env, variables: [{ name: "minuscule", usage: "x" }] })).toBe(false);
    expect(await ok({ kind: "env.update", specId: "ENV-recette", access: "Équipe" })).toBe(true);
    // « Accès » vidé : accepté à la modification seulement (B765).
    expect(await ok({ kind: "env.update", specId: "ENV-recette", access: "" })).toBe(true);
    expect(await ok({ ...env, access: "" })).toBe(false);
    expect(await ok({ kind: "env.update", specId: "ENV-recette", name: "" })).toBe(false);
    expect(await ok({ kind: "env.delete", specId: "ENV-recette" })).toBe(true);
  });

  it("doc.section.* : deliverable facultatif, architecture ou technique seulement", async () => {
    const section = { kind: "doc.section.create", title: "Objet", markdown: "Texte." };
    expect(await ok(section)).toBe(true);
    expect(await ok({ ...section, deliverable: "technical" })).toBe(true);
    expect(await ok({ ...section, deliverable: "security" })).toBe(false);
    const kept = await parsed(
      input("specBatch.submit"),
      batch([{ kind: "doc.section.delete", specId: "DOC-objet", deliverable: "technical" }]),
    );
    expect(JSON.stringify(kept)).toContain("technical");
  });

  it.each(["ST-sms", "NFR-004", "ENV-recette", "reservation.create"])(
    "specBatch rend l'identifiant %s",
    async (specId) => {
      const result = {
        id: UUID,
        branch: "cadrage",
        status: "committed",
        idempotencyKey: "k",
        baseSha: null,
        commitSha: SHA,
        errorCode: null,
        report: null,
        results: [{ position: 0, kind: "stack.update", specId }],
        enqueuedAt: "2026-11-27T10:00:00.000Z",
        committedAt: null,
      };
      expect(await isValid(output("specBatch.submit"), result)).toBe(true);
    },
  );
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("TK-115 lectures", () => {
  it("stack.list : q, cursor ou around (exclusifs), limite bornée", async () => {
    const list = input("spec.technical.stack.list");
    expect(await isValid(list, { projectId: UUID, q: "sms", limit: 24 })).toBe(true);
    expect(await isValid(list, { projectId: UUID, around: "ST-sms" })).toBe(true);
    expect(await isValid(list, { projectId: UUID, around: "ST-sms", cursor: "x" })).toBe(false);
    expect(await isValid(list, { projectId: UUID, limit: 101 })).toBe(false);
  });

  it("environnements : liste vide sans index (commitSha nul), aucune clé de valeur", async () => {
    const empty = { environments: [], variables: [], integrations: [], commitSha: null };
    expect(await isValid(output("spec.technical.environments"), empty)).toBe(true);
    const kept = await parsed(output("spec.technical.environments"), {
      ...empty,
      variables: [{ name: "A", usage: "u", value: "ne-pas-rendre" }],
    });
    expect(JSON.stringify(kept)).not.toContain("ne-pas-rendre");
  });

  it("spec.item.get : types stack et environment, identifiant du type", async () => {
    const item = input("spec.item.get");
    expect(await isValid(item, { projectId: UUID, type: "stack", id: "ST-sms" })).toBe(true);
    expect(await isValid(item, { projectId: UUID, type: "environment", id: "ENV-recette" })).toBe(
      true,
    );
    expect(await isValid(item, { projectId: UUID, type: "stack", id: "ENV-recette" })).toBe(false);
  });

  it("spec.refs.search : composants et exigences", async () => {
    const search = input("spec.refs.search");
    expect(await isValid(search, { projectId: UUID, kinds: ["component", "nfr"], q: "" })).toBe(
      true,
    );
  });

  it("spec.head : compteurs stack, nfr et environments", async () => {
    const counts = Object.fromEntries(
      [
        "features",
        "tables",
        "endpoints",
        "rules",
        "roles",
        "flows",
        "relations",
        "fixtures",
        "components",
      ].map((key) => [key, 0]),
    );
    const head = {
      branch: "cadrage",
      commitSha: SHA,
      status: "ready",
      errorCode: null,
      indexedAt: "2026-11-27T10:00:00.000Z",
    };
    expect(await isValid(output("spec.head"), { ...head, counts })).toBe(false);
    const full = { ...counts, stack: 24, nfr: 28, environments: 3 };
    expect(await isValid(output("spec.head"), { ...head, counts: full })).toBe(true);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("TK-115 propositions, préremplissage, commentaires, impact amont", () => {
  it.each(["compare", "nfr"])("mode %s du livrable technique", async (mode) => {
    const propose = input("ai.proposeDeliverable");
    expect(await isValid(propose, { projectId: UUID, deliverable: "technical", mode })).toBe(true);
  });

  it.each(["stack", "op", "nfr", "env"])("proposition de type %s", async (kind) => {
    const proposal = {
      id: UUID,
      launchId: UUID,
      kind,
      zone: "Stack",
      position: 0,
      title: "t",
      rationale: "r",
      content: {},
      status: "pending",
      appliedBatchId: null,
      createdAt: "2026-11-27T10:00:00.000Z",
    };
    expect(await isValid(output("proposal.decide"), proposal)).toBe(true);
  });

  it("ai.prefillItem : choix technique et environnement, sortie du type demandé", async () => {
    const prefill = input("ai.prefillItem");
    for (const type of ["feature", "stack", "environment"]) {
      expect(await isValid(prefill, { projectId: UUID, type, description: "x" }), type).toBe(true);
    }
    const out = output("ai.prefillItem");
    expect(await isValid(out, { type: "stack", values: { role: "PDF", status: "open" } })).toBe(
      true,
    );
    const env = await parsed(out, {
      type: "environment",
      values: { name: "Démo", variables: [{ name: "A", usage: "b" }] },
    });
    expect(env).toEqual({ type: "environment", values: { name: "Démo" } });
  });

  it.each([
    ["stack", "ST-sms", "C-api"],
    ["environments", "environments", "ENV-recette"],
    ["tech_section", "DOC-objet", "ST-sms"],
  ])("commentaire %s : targetRef %s", async (targetKind, good, bad) => {
    const create = input("comment.create");
    const base = { projectId: UUID, body: "Une question." };
    expect(await isValid(create, { ...base, targetKind, targetRef: good })).toBe(true);
    expect(await isValid(create, { ...base, targetKind, targetRef: bad })).toBe(false);
  });

  it("spec.deliverables : staleTechnical, changements fermés, 50 au plus", async () => {
    const entry = {
      key: "technical",
      status: "revise",
      available: true,
      forced: false,
      condition: null,
      pendingProposals: 0,
    };
    const staleTechnical = {
      changes: [
        { id: "C-avis", change: "added" },
        { id: "ADR-006", change: "accepted" },
      ],
      items: ["ST-sms", "NFR-004", "avis.create"],
    };
    const out = output("spec.deliverables");
    const list = (value: unknown) => ({ deliverables: [value], validatedCount: 0 });
    const kept = await parsed(out, list({ ...entry, staleTechnical }));
    expect(JSON.stringify(kept)).toContain("ADR-006");
    const bad = { changes: [{ id: "T-x", change: "added" }], items: [] };
    expect(await isValid(out, list({ ...entry, staleTechnical: bad }))).toBe(false);
  });
});
