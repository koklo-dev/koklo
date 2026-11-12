import { describe, expect, it } from "vitest";
import { type EntityHash, targetHashOf } from "./target-hash.ts";

/**
 * TK-100 lot B (B325 b, c) : hachage de la cible, calculé sur les hachages d'entités de la tête. Élément = son hachage ;
 * `rules` = les `R-*` dans l'ordre ; `roles` = le fichier des rôles ; `deliverable` = tous ses éléments.
 */
const h = (c: string) => c.repeat(64);
const E = (kind: string, specId: string, hash: string): EntityHash => ({ kind, specId, hash });
const ENTITIES: EntityHash[] = [
  E("feature", "F-001", h("1")),
  E("feature", "F-002", h("2")),
  E("rule", "R-002", h("4")),
  E("rule", "R-001", h("3")),
  E("roles", "roles", h("5")),
  E("flow", "P-001", h("6")),
  E("table", "T-user", h("7")),
  E("relations", "relations", h("8")),
  E("endpoint", "E-auth", h("9")),
];

describe("hachage de cible", () => {
  it("élément : le hachage de l'entité ; absent : null", () => {
    expect(targetHashOf(ENTITIES, "feature", "F-001")).toBe(h("1"));
    expect(targetHashOf(ENTITIES, "flow", "P-001")).toBe(h("6"));
    expect(targetHashOf(ENTITIES, "roles", "roles")).toBe(h("5"));
    expect(targetHashOf(ENTITIES, "feature", "F-009")).toBeNull();
    expect(targetHashOf(ENTITIES, "flow", "P-009")).toBeNull();
  });

  it("baseline : jamais de hachage (comparée au SHA de tête)", () => {
    expect(targetHashOf(ENTITIES, "baseline", "baseline-0")).toBeNull();
  });

  it("bloc des règles : stable, indépendant de l'ordre de lecture, sensible à chaque règle", () => {
    const base = targetHashOf(ENTITIES, "rules", "rules");
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(targetHashOf([...ENTITIES].reverse(), "rules", "rules")).toBe(base);
    const changed = ENTITIES.map((e) => (e.specId === "R-001" ? { ...e, hash: h("a") } : e));
    expect(targetHashOf(changed, "rules", "rules")).not.toBe(base);
    const other = ENTITIES.map((e) => (e.specId === "F-001" ? { ...e, hash: h("a") } : e));
    expect(targetHashOf(other, "rules", "rules")).toBe(base);
  });

  it("bloc des règles sans règle : null (la cible n'existe pas)", () => {
    expect(
      targetHashOf(
        ENTITIES.filter((e) => e.kind !== "rule"),
        "rules",
        "rules",
      ),
    ).toBeNull();
  });

  it("livrable : tous ses éléments (Fonctionnel = feature, rule, roles, flow ; Données = table, relations)", () => {
    const functional = targetHashOf(ENTITIES, "deliverable", "functional");
    const data = targetHashOf(ENTITIES, "deliverable", "data");
    expect(functional).not.toBe(data);
    const edited = (id: string) =>
      ENTITIES.map((e) => (e.specId === id ? { ...e, hash: h("a") } : e));
    for (const id of ["F-002", "R-001", "roles", "P-001"]) {
      expect(targetHashOf(edited(id), "deliverable", "functional"), id).not.toBe(functional);
      expect(targetHashOf(edited(id), "deliverable", "data"), id).toBe(data);
    }
    for (const id of ["T-user", "relations"]) {
      expect(targetHashOf(edited(id), "deliverable", "data"), id).not.toBe(data);
      expect(targetHashOf(edited(id), "deliverable", "functional"), id).toBe(functional);
    }
    expect(targetHashOf(edited("E-auth"), "deliverable", "functional")).toBe(functional);
  });

  it("livrable sans entité indexée (Architecture, Technique, Sécurité, Design, Qualité) : null", () => {
    for (const key of ["architecture", "technical", "security", "design", "quality"]) {
      expect(targetHashOf(ENTITIES, "deliverable", key), key).toBeNull();
    }
  });
});
