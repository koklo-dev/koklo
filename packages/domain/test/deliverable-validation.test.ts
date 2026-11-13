import { describe, expect, it } from "vitest";
import {
  DELIVERABLE_DEPENDENCIES,
  DELIVERABLE_ENTITY_KINDS,
  type DeliverableKey,
  deliverableStatusOf,
} from "../src/index.ts";

/**
 * TK-100 lot B (B325 b, c) : quelles entités composent un livrable et comment le statut se déduit des validations
 * de ses cibles (éléments, bloc, livrable entier). Règle pure.
 */
describe("entités d'un livrable (B325 c)", () => {
  it("Fonctionnel = feature, rule, roles, flow ; Données = table, relations, fixture ; les autres sans entité indexée", () => {
    expect(DELIVERABLE_ENTITY_KINDS.functional).toEqual(["feature", "rule", "roles", "flow"]);
    expect(DELIVERABLE_ENTITY_KINDS.data).toEqual(["table", "relations", "fixture"]);
    for (const key of ["architecture", "technical", "security", "design", "quality"] as const) {
      expect(DELIVERABLE_ENTITY_KINDS[key]).toEqual([]);
    }
  });

  it("couvre exactement les sept clés du graphe B1", () => {
    expect(Object.keys(DELIVERABLE_ENTITY_KINDS)).toEqual(
      Object.keys(DELIVERABLE_DEPENDENCIES) as DeliverableKey[],
    );
  });
});

describe("statut d'un livrable d'après ses validations (B325)", () => {
  const status = deliverableStatusOf;

  it("« À faire » sans entité, quelles que soient les validations", () => {
    expect(status({ hasEntity: false, targets: [], whole: "to_validate" })).toBe("todo");
  });

  it("« À valider » dès qu'il y a une entité et rien de validé", () => {
    expect(
      status({ hasEntity: true, targets: ["to_validate", "to_validate"], whole: "to_validate" }),
    ).toBe("pending");
  });

  it("« Validé » quand toutes les cibles sont validées", () => {
    expect(
      status({ hasEntity: true, targets: ["validated", "validated"], whole: "to_validate" }),
    ).toBe("validated");
  });

  it("« Validé » par le livrable entier même sans cible élément", () => {
    expect(status({ hasEntity: true, targets: [], whole: "validated" })).toBe("validated");
  });

  it("une cible validée sur deux : « À valider »", () => {
    expect(
      status({ hasEntity: true, targets: ["validated", "to_validate"], whole: "to_validate" }),
    ).toBe("pending");
  });

  it("une demande de changement : « À revoir », même si d'autres cibles sont validées", () => {
    expect(
      status({ hasEntity: true, targets: ["validated", "to_revise"], whole: "to_validate" }),
    ).toBe("revise");
    expect(status({ hasEntity: true, targets: [], whole: "to_revise" })).toBe("revise");
  });
});
