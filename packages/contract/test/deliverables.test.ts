import { describe, expect, it } from "vitest";
import { DELIVERABLE_KEYS, generateOpenApi } from "../src/index.ts";
import { errors, input, isValid, output, proc, UUID } from "./support.ts";

/**
 * TK-100 lot A (contrat 2.10.0, additif) : `spec.deliverables` (sept livrables, disponibilité, condition, propositions
 * en attente, `staleBecause` déclaré) et `spec.forceDeliverable` (owner et admin, `confirm: true`).
 */
const entry = (key: string, over: Record<string, unknown> = {}) => ({
  key,
  status: "todo",
  available: false,
  forced: false,
  condition: "Disponible après le fonctionnel",
  pendingProposals: 0,
  ...over,
});
const LIST = { deliverables: DELIVERABLE_KEYS.map((key) => entry(key)), validatedCount: 0 };

describe("TK-100 A surface : deux routes, chemins et méthodes", () => {
  it.each([
    ["spec.deliverables", "get", "/projects/{projectId}/spec/deliverables"],
    ["spec.forceDeliverable", "post", "/projects/{projectId}/spec/deliverables/{key}/force"],
  ])("%s : %s %s", async (name, method, path) => {
    expect(proc(name), name).toBeDefined();
    const doc = (await generateOpenApi()) as { paths: Record<string, Record<string, unknown>> };
    expect(doc.paths[path]?.[method], `${method} ${path}`).toBeDefined();
  });

  it("le groupe spec compte head, listFeatures, getFeature, deliverables, forceDeliverable, item (TK-101), refs (TK-101), functional et roles (TK-103), data (TK-107)", async () => {
    const { contract } = await import("../src/index.ts");
    expect(Object.keys((contract as unknown as Record<string, object>).spec ?? {}).sort()).toEqual([
      "data",
      "deliverables",
      "forceDeliverable",
      "functional",
      "getFeature",
      "head",
      "item",
      "listFeatures",
      "refs",
      "roles",
    ]);
  });

  it("la constante DELIVERABLE_KEYS est unique : sept clés, Sécurité en 5e", () => {
    expect([...DELIVERABLE_KEYS]).toEqual([
      "functional",
      "data",
      "architecture",
      "technical",
      "security",
      "design",
      "quality",
    ]);
  });
});

describe("TK-100 A spec.deliverables", () => {
  it("entrée : projectId UUID seul", async () => {
    expect(await isValid(input("spec.deliverables"), { projectId: UUID })).toBe(true);
    expect(await isValid(input("spec.deliverables"), { projectId: "x" })).toBe(false);
  });

  it("sortie : sept entrées et le compteur de validés", async () => {
    const out = output("spec.deliverables");
    expect(await isValid(out, LIST)).toBe(true);
    expect(await isValid(out, { ...LIST, validatedCount: -1 })).toBe(false);
    expect(await isValid(out, { deliverables: LIST.deliverables })).toBe(false);
  });

  it.each(["todo", "pending", "revise", "validated"])("statut %s accepté", async (status) => {
    const out = output("spec.deliverables");
    const deliverables = [entry("functional", { status }), ...LIST.deliverables.slice(1)];
    expect(await isValid(out, { ...LIST, deliverables })).toBe(true);
  });

  it("refuse un statut ou une clé inconnus, un compteur de propositions négatif", async () => {
    const out = output("spec.deliverables");
    for (const bad of [
      entry("functional", { status: "done" }),
      entry("screens"),
      entry("functional", { pendingProposals: -1 }),
      entry("functional", { forced: "oui" }),
    ]) {
      expect(await isValid(out, { ...LIST, deliverables: [bad] }), JSON.stringify(bad)).toBe(false);
    }
  });

  it("condition nulle ou texte ; staleBecause optionnel : idée et pages modifiées", async () => {
    const out = output("spec.deliverables");
    const stale = { idea: "idea-v2", changedPages: 3 };
    for (const over of [{ condition: null }, { staleBecause: stale }]) {
      const deliverables = [entry("functional", over)];
      expect(await isValid(out, { ...LIST, deliverables })).toBe(true);
    }
    const bad = [entry("functional", { staleBecause: { idea: "idea-v2", changedPages: -1 } })];
    expect(await isValid(out, { ...LIST, deliverables: bad })).toBe(false);
  });

  it("staleUpstream optionnel (3.7.0) : identifiants F-nnn ou R-nnn des amonts modifiés", async () => {
    const out = output("spec.deliverables");
    const ok = [entry("data", { status: "revise", staleUpstream: ["F-002", "R-004"] })];
    expect(await isValid(out, { ...LIST, deliverables: ok })).toBe(true);
    const tooMany = Array.from({ length: 21 }, (_, i) => `F-${String(i + 1).padStart(3, "0")}`);
    for (const staleUpstream of [["X-1"], [""], "F-002", tooMany]) {
      const bad = [entry("data", { staleUpstream })];
      expect(
        await isValid(out, { ...LIST, deliverables: bad }),
        JSON.stringify(staleUpstream),
      ).toBe(false);
    }
  });

  it("erreurs : 401 et 404, pas de 403 (tout rôle ayant accès au projet lit)", () => {
    const declared = Object.keys(errors("spec.deliverables"));
    expect(declared).toEqual(expect.arrayContaining(["UNAUTHORIZED", "NOT_FOUND", "INTERNAL"]));
    expect(declared).not.toContain("FORBIDDEN");
  });
});

describe("TK-100 A spec.forceDeliverable", () => {
  const body = { projectId: UUID, key: "data", confirm: true };

  it("entrée : confirm doit valoir true, la clé est un des sept livrables", async () => {
    const i = input("spec.forceDeliverable");
    expect(await isValid(i, body)).toBe(true);
    for (const bad of [
      { ...body, confirm: false },
      { projectId: UUID, key: "data" },
      { ...body, key: "screens" },
      { ...body, confirm: "true" },
    ]) {
      expect(await isValid(i, bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it("sortie : l'entrée du livrable forcé", async () => {
    const out = output("spec.forceDeliverable");
    expect(await isValid(out, entry("data", { forced: true, available: true }))).toBe(true);
    expect(await isValid(out, { key: "data" })).toBe(false);
  });

  it("erreurs : 401, 403, 404", () => {
    expect(Object.keys(errors("spec.forceDeliverable"))).toEqual(
      expect.arrayContaining(["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "INTERNAL"]),
    );
  });
});
