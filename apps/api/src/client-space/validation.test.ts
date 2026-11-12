import { describe, expect, it } from "vitest";
import { latestReview, type ReviewVerdict, validationOf } from "./validation.ts";

/**
 * TK-104 (B349) : `withdrawn` remet la cible « à valider », jamais « précédemment validé » ; le journal reste en ajout
 * seul, la plus récente review fait foi.
 */
const HEAD = "a".repeat(40);
const at = (minute: number) => new Date(Date.UTC(2026, 10, 12, 10, minute));
const review = (over: Partial<ReviewVerdict> = {}): ReviewVerdict => ({
  id: "019a0000-0000-7000-8000-000000000001",
  status: "approved",
  sha: HEAD,
  createdAt: at(0),
  contentHash: "h1",
  currentHash: "h1",
  ...over,
});
const TO_VALIDATE = { validation: "to_validate", previouslyValidated: false };

describe("validationOf avec une annulation", () => {
  it("annulée sur le contenu courant : à valider, jamais précédemment validée", () => {
    expect(validationOf(review({ status: "withdrawn" }), HEAD)).toEqual(TO_VALIDATE);
  });

  it("annulée puis le contenu change : toujours à valider, pas « précédemment validée »", () => {
    expect(validationOf(review({ status: "withdrawn", currentHash: "h2" }), HEAD)).toEqual(
      TO_VALIDATE,
    );
  });

  it("l'annulation est la plus récente : approuver, annuler, puis la dernière fait foi", () => {
    const approved = review({ id: "019a0000-0000-7000-8000-000000000001", createdAt: at(0) });
    const withdrawn = review({
      id: "019a0000-0000-7000-8000-000000000002",
      status: "withdrawn",
      createdAt: at(1),
    });
    expect(validationOf(latestReview([approved, withdrawn]), HEAD)).toEqual(TO_VALIDATE);
    const again = review({ id: "019a0000-0000-7000-8000-000000000003", createdAt: at(2) });
    expect(validationOf(latestReview([approved, withdrawn, again]), HEAD).validation).toBe(
      "validated",
    );
  });

  it("demande de changement puis annulation : à valider (la demande n'est plus d'actualité)", () => {
    const asked = review({ status: "changes_requested", createdAt: at(0) });
    const withdrawn = review({
      id: "019a0000-0000-7000-8000-000000000002",
      status: "withdrawn",
      createdAt: at(1),
    });
    expect(validationOf(latestReview([asked, withdrawn]), HEAD)).toEqual(TO_VALIDATE);
  });
});
