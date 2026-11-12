import { describe, expect, it } from "vitest";
import { bannerCopy, progressSummary, validationOf } from "../src/lib/client-validation-labels.ts";
import { remindText } from "../src/lib/use-remind-client.ts";
import { decisionErrorText } from "../src/lib/use-review-actions.ts";
import { progress } from "./support/client-space.tsx";
import { apiError } from "./support/web-mocks.ts";

/** TK-104 lot B (B353) : phrases d'échec et de relance en français, jamais le code technique ; libellés de la vue client. */
describe("decisionErrorText", () => {
  it.each([
    [apiError("CONFLICT", { reason: "review_incomplete" }), "Il reste des éléments à traiter"],
    [
      apiError("STALE_VERSION"),
      "Le cahier a changé depuis votre lecture. Rechargez la page pour relire la version à jour.",
    ],
    [apiError("FORBIDDEN"), "Vous ne pouvez pas valider ce cahier."],
    [apiError("INTERNAL"), "La décision n'a pas pu être enregistrée. Réessayez."],
    [new Error("réseau"), "La décision n'a pas pu être enregistrée. Réessayez."],
  ])("%#", (error, text) => {
    expect(decisionErrorText(error)).toBe(text);
  });
});

describe("remindText", () => {
  it("dit l'envoi, le doublon du jour, l'absence de client et l'échec", () => {
    expect(remindText({ reminded: 1 }, null)).toBe("Rappel envoyé");
    expect(remindText({ reminded: 0 }, null)).toBe("Le client a déjà été relancé aujourd'hui");
    expect(remindText(undefined, apiError("CONFLICT", { reason: "no_client" }))).toBe(
      "Aucun client n'est invité à ce projet.",
    );
    expect(remindText(undefined, apiError("INTERNAL"))).toBe(
      "La relance n'a pas pu être envoyée. Réessayez.",
    );
    expect(remindText(undefined, null)).toBe("");
  });
});

describe("libellés de la vue client", () => {
  it("la progression additionne règles et rôles", () => {
    const p = progress({
      tabs: {
        features: { units: 248, treated: 12 },
        flows: { units: 18, treated: 3 },
        rules: { units: 1, treated: 1 },
        roles: { units: 1, treated: 0 },
      },
    });
    expect(progressSummary(p as never)).toBe(
      "Fonctionnalités 12/248 · parcours 3/18 · règles et rôles 1/2",
    );
  });

  it("« à valider » est l'attente ; jamais « précédemment validé »", () => {
    expect(validationOf("to_validate")).toBe("pending");
    expect(validationOf("to_revise")).toBe("revise");
    expect(validationOf("validated")).toBe("validated");
  });

  it("le bandeau dépend du lecteur : client attendu, équipe sans client, lecture seule, cahier validé", () => {
    expect(bannerCopy(progress() as never).tone).toBe("warning");
    expect(bannerCopy(progress({ hasClient: false }) as never).title).toMatch(/Aucun client/);
    expect(bannerCopy(progress({ canValidate: false }) as never)).toMatchObject({
      tone: "neutral",
      title: "Vous consultez le cahier.",
    });
    expect(bannerCopy(progress({ validation: "validated" }) as never).title).toBe(
      "Le cahier est validé.",
    );
  });
});
