import { describe, expect, it } from "vitest";
import { latestReview, type ReviewVerdict, validationOf } from "../src/client-space/validation.ts";

/**
 * TK-55b : calcul du statut de validation d'une cible (analyse §3.4, D6). Fonction pure : la dernière
 * review de la cible fait foi, tous clients confondus ; elle ne vaut que si son `sha` est la tête.
 */
const HEAD = "a".repeat(40);
const OLD = "b".repeat(40);
const at = (minute: number) => new Date(Date.UTC(2026, 10, 2, 10, minute));

const review = (over: Partial<ReviewVerdict> = {}): ReviewVerdict => ({
  id: "019a0000-0000-7000-8000-000000000001",
  status: "approved",
  sha: HEAD,
  createdAt: at(0),
  ...over,
});

describe("validationOf : aucune review, ou review sur la tête", () => {
  it("aucune review : à valider, jamais validée", () => {
    expect(validationOf(undefined, HEAD)).toEqual({
      validation: "to_validate",
      previouslyValidated: false,
    });
  });

  it("approuvée sur la tête : validée", () => {
    expect(validationOf(review({ status: "approved", sha: HEAD }), HEAD)).toEqual({
      validation: "validated",
      previouslyValidated: false,
    });
  });

  it("modifications demandées sur la tête : à revoir", () => {
    expect(validationOf(review({ status: "changes_requested", sha: HEAD }), HEAD)).toEqual({
      validation: "to_revise",
      previouslyValidated: false,
    });
  });
});

describe("validationOf : review caduque (la spec a avancé)", () => {
  it("approuvée sur un ancien état : à valider et déjà validée un jour", () => {
    expect(validationOf(review({ status: "approved", sha: OLD }), HEAD)).toEqual({
      validation: "to_validate",
      previouslyValidated: true,
    });
  });

  it("modifications demandées sur un ancien état : à valider, pas « déjà validée »", () => {
    expect(validationOf(review({ status: "changes_requested", sha: OLD }), HEAD)).toEqual({
      validation: "to_validate",
      previouslyValidated: false,
    });
  });

  it("la comparaison est exacte, sans normalisation (casse, préfixe)", () => {
    for (const sha of [HEAD.toUpperCase(), HEAD.slice(0, 39), `${HEAD}0`]) {
      expect(validationOf(review({ sha }), HEAD).validation, sha).toBe("to_validate");
    }
  });
});

describe("latestReview : la dernière gagne", () => {
  it("liste vide : rien", () => {
    expect(latestReview([])).toBeUndefined();
  });

  it("la plus récente par date l'emporte, quel que soit l'ordre d'entrée", () => {
    const first = review({ id: "019a0000-0000-7000-8000-000000000001", createdAt: at(1) });
    const second = review({
      id: "019a0000-0000-7000-8000-000000000002",
      status: "changes_requested",
      createdAt: at(2),
    });
    expect(latestReview([first, second])?.id).toBe(second.id);
    expect(latestReview([second, first])?.id).toBe(second.id);
  });

  it("A puis B puis A : la troisième ligne fait foi", () => {
    const rows = [
      review({ id: "019a0000-0000-7000-8000-000000000001", status: "approved", createdAt: at(1) }),
      review({
        id: "019a0000-0000-7000-8000-000000000002",
        status: "changes_requested",
        createdAt: at(2),
      }),
      review({ id: "019a0000-0000-7000-8000-000000000003", status: "approved", createdAt: at(3) }),
    ];
    expect(latestReview(rows)?.id).toBe("019a0000-0000-7000-8000-000000000003");
  });

  it("à date égale, l'identifiant le plus grand (uuid v7 monotone) l'emporte", () => {
    const low = review({ id: "019a0000-0000-7000-8000-000000000001", createdAt: at(1) });
    const high = review({
      id: "019a0000-0000-7000-8000-000000000009",
      status: "changes_requested",
      createdAt: at(1),
    });
    expect(latestReview([high, low])?.id).toBe(high.id);
    expect(latestReview([low, high])?.id).toBe(high.id);
  });

  it("ne modifie pas le tableau reçu", () => {
    const rows = [review({ createdAt: at(2) }), review({ createdAt: at(1) })];
    const copy = [...rows];
    latestReview(rows);
    expect(rows).toEqual(copy);
  });
});
