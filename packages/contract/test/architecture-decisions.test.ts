import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION, generateOpenApi } from "../src/index.ts";
import { errors, input, isValid, output, proc, SHA, scopedInput, UUID } from "./support.ts";

/**
 * TK-113 lot A (contrat 3.11.0, additif, B575 à B592) : `spec.architecture.adr.list` et `.byId`, item `adr` de `spec.item.get`,
 * `staleUpstream` étendu aux tables plus `staleComponents` et `staleFlows`, cibles de commentaire `component`, `adr` et
 * `archflow`, lectures `clientSpace.architecture*`.
 */
describe("TK-113 surface", () => {
  it("version 3.12.0 (additif : mineure)", () => {
    expect(CONTRACT_VERSION).toBe("3.12.0");
  });

  it.each([
    ["spec.architecture.adr.list", "/projects/{projectId}/spec/architecture/adr"],
    ["spec.architecture.adr.byId", "/projects/{projectId}/spec/architecture/adr/{adrId}"],
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

  it.each([
    ["clientSpace.architecture", "/client-space/projects/{projectId}/architecture"],
    ["clientSpace.adrs", "/client-space/projects/{projectId}/architecture/adrs"],
    ["clientSpace.adr", "/client-space/projects/{projectId}/architecture/adrs/{adrId}"],
    ["clientSpace.archFlows", "/client-space/projects/{projectId}/architecture/flows"],
    ["clientSpace.archFlow", "/client-space/projects/{projectId}/architecture/flows/{flowId}"],
  ])("%s : GET %s, lecture seule, sans champ technique", async (name, path) => {
    expect(proc(name), name).toBeDefined();
    const doc = (await generateOpenApi()) as { paths: Record<string, Record<string, unknown>> };
    expect(Object.keys(doc.paths[path] ?? {})).toEqual(["get"]);
    expect(JSON.stringify(doc.paths[path])).not.toMatch(/filePath|commitSha|mermaid|yaml/i);
  });
});

describe("TK-113 adr.list : entrée", () => {
  const i = () => input("spec.architecture.adr.list");
  it("accepte les filtres statut, composant et période, la recherche, la position", async () => {
    expect(await isValid(i(), { projectId: UUID })).toBe(true);
    const full = {
      projectId: UUID,
      q: "file",
      status: "acceptee",
      component: "C-api",
      from: "2026-01-01",
      to: "2026-12-31",
      limit: "50",
    };
    expect(await isValid(i(), full)).toBe(true);
    expect(await isValid(i(), { projectId: UUID, around: "ADR-120" })).toBe(true);
    expect(await isValid(i(), { projectId: UUID, branch: "main" })).toBe(true);
  });
  it.each([
    ["statut inconnu", { status: "refusee" }],
    ["composant mal formé", { component: "api" }],
    ["date mal formée", { from: "1er janvier" }],
    ["around mal formé", { around: "adr-1" }],
    ["around avec curseur", { around: "ADR-001", cursor: "x" }],
    ["branche et commit", { branch: "main", commitSha: SHA }],
  ])("refuse : %s", async (_name, extra) => {
    expect(await isValid(i(), { projectId: UUID, ...extra })).toBe(false);
  });
});

const adr = {
  specId: "ADR-001",
  title: "Monolithe modulaire",
  status: "remplacee",
  date: "2026-10-28",
  deciders: ["Équipe"],
  context: "Contexte",
  decision: "Décision",
  consequences: { positive: ["Simple"], toAccept: ["Couplage"] },
  alternatives: [{ name: "Microservices", reason: "Trop lourd" }],
  links: ["C-api", "F-001", "R-002", "T-clients", "P-signup"],
  supersededBy: "ADR-009",
  supersededOn: "2026-11-02",
  plain: "En clair",
  filePath: "architecture/adr/ADR-001-monolithe.md",
  commitSha: SHA,
};

describe("TK-113 adr : sorties", () => {
  it("adr.byId : fiche complète, supersededBy et supersededOn facultatifs", async () => {
    const o = output("spec.architecture.adr.byId");
    expect(await isValid(o, adr)).toBe(true);
    const { supersededBy, supersededOn, plain, ...minimal } = adr;
    expect(await isValid(o, { ...minimal, status: "acceptee" })).toBe(true);
    expect(await isValid(o, { ...adr, status: "refusee" })).toBe(false);
    expect(await isValid(o, { ...adr, specId: "ADR-1" })).toBe(false);
    expect(await isValid(o, { ...adr, commitSha: "abc" })).toBe(false);
    expect(await isValid(o, { ...adr, consequences: { positive: ["x"] } })).toBe(false);
  });
  it("adr.list : page comme components.list, ligne de résumé", async () => {
    const o = output("spec.architecture.adr.list");
    const row = {
      specId: "ADR-001",
      title: "T",
      status: "acceptee",
      date: "2026-10-28",
      links: ["C-api"],
      filePath: "a.md",
    };
    const page = {
      items: [row],
      nextCursor: null,
      previousCursor: null,
      offset: 0,
      total: 1,
      facets: { status: { acceptee: 1 } },
    };
    expect(await isValid(o, page)).toBe(true);
    expect(await isValid(o, { ...page, items: [{ ...row, status: "x" }] })).toBe(false);
  });
  it("spec.item.get : type adr, valeurs de la fiche", async () => {
    const i = input("spec.item.get");
    expect(await isValid(i, { projectId: UUID, type: "adr", id: "ADR-001" })).toBe(true);
    expect(await isValid(i, { projectId: UUID, type: "adr", id: "C-api" })).toBe(false);
    const shared = { validated: false, referencedBy: { items: [], total: 0 } };
    expect(
      await isValid(output("spec.item.get"), {
        type: "adr",
        id: "ADR-001",
        values: adr,
        ...shared,
      }),
    ).toBe(true);
  });
});

describe("TK-113 livrables : amont étendu aux tables, composants et flux concernés", () => {
  const out = () => output("spec.deliverables");
  const base = {
    key: "architecture",
    status: "revise",
    available: true,
    forced: false,
    condition: null,
    pendingProposals: 0,
  };
  const list = (over: Record<string, unknown>) => ({
    deliverables: [{ ...base, ...over }],
    validatedCount: 0,
  });
  it("staleUpstream accepte F, R et T ; staleComponents et staleFlows facultatifs", async () => {
    const ok = {
      staleUpstream: ["F-002", "R-004", "T-clients"],
      staleComponents: ["C-api"],
      staleFlows: ["P-signup"],
    };
    expect(await isValid(out(), list(ok))).toBe(true);
    expect(await isValid(out(), list({}))).toBe(true);
  });
  it.each([
    ["amont inconnu", { staleUpstream: ["E-1"] }],
    ["table mal formée", { staleUpstream: ["T-Clients"] }],
    ["composant mal formé", { staleComponents: ["api"] }],
    ["flux mal formé", { staleFlows: ["signup"] }],
    ["trop de composants", { staleComponents: Array.from({ length: 51 }, (_, n) => `C-c${n}`) }],
    ["trop de flux", { staleFlows: Array.from({ length: 51 }, (_, n) => `P-p${n}`) }],
    ["trop d'amonts", { staleUpstream: Array.from({ length: 21 }, (_, n) => `T-t${n}`) }],
  ])("refuse : %s", async (_name, over) => {
    expect(await isValid(out(), list(over))).toBe(false);
  });
});

describe("TK-113 commentaires : cibles component, adr, archflow", () => {
  const create = (target: Record<string, unknown>) => ({ ...target, body: "Bonjour" });
  it.each([
    ["component", "C-api"],
    ["adr", "ADR-001"],
    ["archflow", "P-signup"],
  ])("create : %s exige targetRef de sa forme, sans targetId", async (kind, ref) => {
    const i = scopedInput("comment.create");
    expect(await isValid(i, create({ targetKind: kind, targetRef: ref }))).toBe(true);
    expect(await isValid(i, create({ targetKind: kind }))).toBe(false);
    expect(await isValid(i, create({ targetKind: kind, targetId: UUID }))).toBe(false);
    expect(await isValid(i, create({ targetKind: kind, targetRef: "T-clients" }))).toBe(false);
    expect(await isValid(i, create({ targetKind: kind, targetRef: "x" }))).toBe(false);
  });
  it("list : même règle de cohérence", async () => {
    const i = scopedInput("comment.list");
    expect(await isValid(i, { targetKind: "adr", targetRef: "ADR-001" })).toBe(true);
    expect(await isValid(i, { targetKind: "adr", targetRef: "C-api" })).toBe(false);
    expect(await isValid(i, { targetKind: "component" })).toBe(false);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même famille de procédures, un test par comportement
describe("TK-113 clientSpace.architecture* : sorties au vocabulaire client", () => {
  it("architecture : available, validation, truncated, composants et positions", async () => {
    const o = output("clientSpace.architecture");
    const component = {
      id: "C-api",
      name: "API",
      type: "service",
      zone: "Noyau",
      summary: ["Reçoit les demandes."],
      serves: [{ id: "F-001", label: "Réserver" }],
      dependsOn: [{ id: "C-db", name: "Base", via: "SQL", async: true }],
    };
    const page = {
      available: true,
      validation: "validated",
      truncated: false,
      items: [component],
      positions: { "C-api": { x: 10, y: 20 } },
    };
    expect(await isValid(o, page)).toBe(true);
    expect(await isValid(o, { ...page, available: false, items: [], positions: {} })).toBe(true);
    expect(await isValid(o, { ...page, items: [{ ...component, filePath: "x" }] })).toBe(true);
    const tooMany = Array.from({ length: 101 }, (_, n) => ({ ...component, id: `C-c${n}` }));
    expect(await isValid(o, { ...page, items: tooMany })).toBe(false);
  });
  it("adr : fiche sans chemin ni SHA ; adrs : page et disponibilité", async () => {
    const { filePath, commitSha, specId, links, ...rest } = adr;
    const detail = { id: specId, ...rest };
    expect(await isValid(output("clientSpace.adr"), detail)).toBe(true);
    const parsed = await output("clientSpace.adr")?.["~standard"].validate({
      ...detail,
      filePath: "a.md",
      commitSha: SHA,
    });
    expect(JSON.stringify(parsed)).not.toMatch(/filePath|commitSha|a\.md/);
    const list = output("clientSpace.adrs");
    const row = { id: "ADR-001", title: "T", status: "acceptee", date: "2026-10-28" };
    const page = {
      available: true,
      validation: "validated",
      items: [row],
      nextCursor: null,
      previousCursor: null,
      offset: 0,
      total: 1,
    };
    expect(await isValid(list, page)).toBe(true);
    expect(await isValid(list, { ...page, available: undefined })).toBe(false);
  });
  it("archFlows et archFlow : sans chemin ni SHA", async () => {
    const flow = {
      specId: "P-signup",
      title: "Inscription",
      actor: "Client",
      participants: [{ id: "C-api", name: "API", type: "service" }],
      items: [{ kind: "message", from: "C-api", to: "C-api", text: "Appelle" }],
      features: ["F-001"],
      rules: [],
    };
    expect(await isValid(output("clientSpace.archFlow"), flow)).toBe(true);
    const parsed = await output("clientSpace.archFlow")?.["~standard"].validate({
      ...flow,
      filePath: "a",
      commitSha: SHA,
      decisions: ["ADR-001"],
    });
    expect(JSON.stringify(parsed)).not.toMatch(/filePath|commitSha|decisions/);
    expect(
      await isValid(input("clientSpace.archFlow"), { projectId: UUID, flowId: "signup" }),
    ).toBe(false);
    expect(
      await isValid(input("clientSpace.adrs"), { projectId: UUID, around: "ADR-001", cursor: "x" }),
    ).toBe(false);
  });
});
