import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION, generateOpenApi } from "../src/index.ts";
import { errors, input, isValid, output, proc, SHA, type StandardLike, UUID } from "./support.ts";

/**
 * TK-116 lot A (contrat 3.18.0, additif, B768 à B779) : onglets API et Exigences, contrat généré, vue client, types
 * `operation` et `nfr` (panneau, préremplissage), cibles de commentaire et refus `choices_open`.
 */
const doc = async () =>
  (await generateOpenApi()) as {
    paths: Record<string, Record<string, unknown>>;
    info: { version: string };
  };

const base = { projectId: UUID };

const TEAM = [
  ["spec.technical.ops.list", "/projects/{projectId}/spec/technical/operations"],
  ["spec.technical.ops.byId", "/projects/{projectId}/spec/technical/operations/{opId}"],
  ["spec.technical.ops.source", "/projects/{projectId}/spec/technical/operations/{opId}/source"],
  ["spec.technical.ops.options", "/projects/{projectId}/spec/technical/operation-options"],
  ["spec.technical.contract", "/projects/{projectId}/spec/technical/operations/{opId}/contract"],
  ["spec.technical.nfr.list", "/projects/{projectId}/spec/technical/nfr"],
] as const;
const CLIENT = [
  ["clientSpace.technicalOps", "/client-space/projects/{projectId}/technical/operations"],
  ["clientSpace.technicalOp", "/client-space/projects/{projectId}/technical/operations/{opId}"],
  ["clientSpace.technicalNfr", "/client-space/projects/{projectId}/technical/nfr"],
] as const;

describe("TK-116 surface", () => {
  it("version 3.19.0 (additif : mineure)", async () => {
    expect(CONTRACT_VERSION).toBe("3.19.0");
    expect((await doc()).info.version).toBe("3.19.0");
  });

  it.each(TEAM)("%s : GET %s, 403 et 404", async (name, path) => {
    expect(proc(name), name).toBeDefined();
    expect((await doc()).paths[path]?.get, path).toBeDefined();
    expect(Object.keys(errors(name))).toEqual(
      expect.arrayContaining(["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "VALIDATION"]),
    );
  });

  it.each(CLIENT)("%s : GET %s, ni chemin, ni SHA, ni YAML", async (name, path) => {
    expect(proc(name), name).toBeDefined();
    const route = (await doc()).paths[path];
    expect(route?.get, path).toBeDefined();
    expect(JSON.stringify(route)).not.toMatch(/yaml|filePath|commitSha/i);
  });
});

const summary = {
  specId: "reservation.create",
  type: "write",
  zone: "Réservation",
  component: "C-api",
  summary: "Crée une réservation.",
  permission: "PM-reservation.creer",
};
const detail = {
  ...summary,
  filePath: "api/endpoints/reservation.create.yaml",
  input: [{ field: "serviceId", type: "uuid", constraint: "Service actif" }],
  output: [{ field: "statut", type: "enum", note: "confirmee" }],
  errors: [{ code: "CRENEAU_PRIS", when: "créneau pris", rule: "R-001" }],
  rules: ["R-001"],
  features: ["F-001"],
  rateLimit: "20 par minute",
  callers: [{ name: "Accueil" }, { name: "Client", restriction: "les siennes" }],
  commitSha: SHA,
};
const page = {
  nextCursor: null,
  previousCursor: null,
  offset: 0,
  total: 1,
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même famille de lectures, un test par cas
describe("TK-116 lectures des opérations et des exigences", () => {
  it("ops.list : zone, q, limit, around ; branch et commitSha exclusifs", async () => {
    const list = input("spec.technical.ops.list");
    expect(await isValid(list, { ...base, zone: "Réservation", q: "rés", limit: 50 })).toBe(true);
    expect(await isValid(list, { ...base, around: "reservation.create" })).toBe(true);
    expect(await isValid(list, { ...base, around: "reservation" })).toBe(false);
    expect(await isValid(list, { ...base, around: "a.b", cursor: "x" })).toBe(false);
    expect(await isValid(list, { ...base, branch: "cadrage", commitSha: SHA })).toBe(false);
    const item = { ...summary, filePath: "api/endpoints/reservation.create.yaml" };
    expect(await isValid(output("spec.technical.ops.list"), { ...page, items: [item] })).toBe(true);
  });

  it("ops.byId : fiche complète, quatre appelants au plus", async () => {
    const byId = output("spec.technical.ops.byId");
    expect(await isValid(byId, detail)).toBe(true);
    const callers = Array.from({ length: 5 }, (_, n) => ({ name: `Rôle ${n}` }));
    expect(await isValid(byId, { ...detail, callers })).toBe(false);
    const request = input("spec.technical.ops.byId");
    expect(await isValid(request, { ...base, opId: "reservation.create" })).toBe(true);
    expect(await isValid(request, { ...base, opId: "../secret" })).toBe(false);
  });

  it("ops.source et ops.options", async () => {
    const source = { path: "api/endpoints/a.b.yaml", text: "id: a.b", commitSha: SHA };
    expect(
      await isValid(output("spec.technical.ops.source"), { ...source, generated: false }),
    ).toBe(true);
    const options = { zones: ["Réservation"], permissions: ["PM-agenda.lire"] };
    expect(await isValid(output("spec.technical.ops.options"), options)).toBe(true);
  });

  it("contract : disponible avec son code, sinon une raison fermée", async () => {
    const contract = output("spec.technical.contract");
    const available = {
      available: true,
      generator: { stackId: "ST-api", label: "TypeScript · oRPC", choice: "oRPC + zod" },
      path: "packages/contract/src/reservation/reservation.ts",
      code: "export const reservationCreate = oc;",
      commitSha: SHA,
    };
    expect(await isValid(contract, available)).toBe(true);
    expect(await isValid(contract, { available: false, reason: "no_choice", commitSha: SHA })).toBe(
      true,
    );
    const other = { available: false, reason: "unsupported_stack", choice: "REST", commitSha: SHA };
    expect(await isValid(contract, other)).toBe(true);
    expect(await isValid(contract, { available: false, reason: "autre", commitSha: SHA })).toBe(
      false,
    );
  });

  it("nfr.list : catégorie, around ; aucun champ de couverture", async () => {
    const list = input("spec.technical.nfr.list");
    expect(await isValid(list, { ...base, category: "performance", around: "NFR-003" })).toBe(true);
    expect(await isValid(list, { ...base, category: "autre" })).toBe(false);
    const item = {
      specId: "NFR-003",
      category: "performance",
      title: "Temps de réponse",
      target: "p95 < 300 ms",
      statement: "Les appels répondent vite.",
      verification: "ci_measure",
      verificationDetail: "k6",
      links: ["C-api"],
      filePath: "nfr/NFR-003.yaml",
    };
    expect(await isValid(output("spec.technical.nfr.list"), { ...page, items: [item] })).toBe(true);
    const published = JSON.stringify(
      (await doc()).paths["/projects/{projectId}/spec/technical/nfr"],
    );
    expect(published).not.toMatch(/coverage|covered/i);
  });

  it("clientSpace : non validé = vide ; `id` à la place de `specId`", async () => {
    const hidden = { available: false, validation: "to_validate" };
    const empty = { ...hidden, ...page, total: 0, items: [] };
    expect(await isValid(output("clientSpace.technicalOps"), empty)).toBe(true);
    expect(await isValid(output("clientSpace.technicalNfr"), empty)).toBe(true);
    expect(await isValid(output("clientSpace.technicalOp"), { ...hidden, operation: null })).toBe(
      true,
    );
    const { specId, filePath: _path, commitSha: _sha, ...rest } = detail;
    const shown = {
      available: true,
      validation: "validated",
      operation: { id: specId, ...rest },
    };
    expect(await isValid(output("clientSpace.technicalOp"), shown)).toBe(true);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même famille d'entrées, un test par cas
describe("TK-116 panneau, préremplissage, commentaires, validation", () => {
  it("spec.item.get : types operation et nfr, identifiant de la forme du type", async () => {
    const get = input("spec.item.get");
    expect(await isValid(get, { ...base, type: "operation", id: "reservation.create" })).toBe(true);
    expect(await isValid(get, { ...base, type: "nfr", id: "NFR-001" })).toBe(true);
    expect(await isValid(get, { ...base, type: "operation", id: "NFR-001" })).toBe(false);
    expect(await isValid(get, { ...base, type: "nfr", id: "a.b" })).toBe(false);
  });

  it("spec.refs.search : genres stack et adr", async () => {
    const search = input("spec.refs.search");
    expect(await isValid(search, { ...base, kinds: ["stack", "adr"], q: "" })).toBe(true);
  });

  it("ai.prefillItem : operation et nfr, tous les champs facultatifs", async () => {
    const request = input("ai.prefillItem");
    for (const type of ["operation", "nfr"]) {
      expect(await isValid(request, { ...base, type, description: "Une phrase." }), type).toBe(
        true,
      );
      expect(await isValid(output("ai.prefillItem"), { type, values: {} }), type).toBe(true);
    }
    const values = {
      name: "reservation.create",
      type: "write",
      zone: "Réservation",
      summary: "Crée.",
      permission: "public",
      input: [{ field: "id", type: "uuid" }],
      output: [{ field: "ok", type: "booléen" }],
      errors: [{ code: "PRIS", when: "pris", rule: "R-001" }],
      links: ["R-001", "F-001"],
      rateLimit: "20 par minute",
    };
    expect(await isValid(output("ai.prefillItem"), { type: "operation", values })).toBe(true);
    const nfr = {
      category: "security",
      title: "T",
      target: "100 %",
      statement: "S",
      verification: "manual",
      links: ["C-api", "ST-api", "ADR-001", "R-001"],
    };
    expect(await isValid(output("ai.prefillItem"), { type: "nfr", values: nfr })).toBe(true);
  });

  it("op.create : le composant est facultatif", async () => {
    const operation = {
      kind: "op.create",
      name: "creneau.listAvailable",
      type: "read",
      zone: "Réservation",
      summary: "Liste les créneaux.",
      permission: "public",
    };
    const batch = { projectId: UUID, idempotencyKey: "k-1", operations: [operation] };
    expect(await isValid(input("specBatch.submit"), batch)).toBe(true);
  });

  it("commentaires : cibles operation (nom) et requirements", async () => {
    const create = input("comment.create");
    const comment = (targetKind: string, targetRef: string) => ({
      projectId: UUID,
      targetKind,
      targetRef,
      body: "Une question.",
    });
    expect(await isValid(create, comment("operation", "reservation.create"))).toBe(true);
    expect(await isValid(create, comment("requirements", "requirements"))).toBe(true);
    expect(await isValid(create, comment("operation", "requirements"))).toBe(false);
    expect(await isValid(create, comment("requirements", "NFR-001"))).toBe(false);
  });

  it("review.submit : raison choices_open", async () => {
    const conflict = errors("review.submit").CONFLICT as { data: StandardLike };
    expect(await isValid(conflict.data, { reason: "choices_open" })).toBe(true);
    expect(await isValid(conflict.data, { reason: "autre" })).toBe(false);
  });
});
