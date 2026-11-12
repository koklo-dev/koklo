import { describe, expect, it } from "vitest";
import { criterionSentence, linkKind } from "../src/lib/client-criteria.ts";

/** TK-104 (passation 06 §4.5) : critère reformulé « Si <étant donné> et que <quand>, alors <alors>. » ; liens par préfixe. */
describe("criterionSentence", () => {
  it("compose Si … et que …, alors … .", () => {
    expect(
      criterionSentence([
        { type: "etant_donne", text: "Un service de 30 minutes" },
        { type: "quand", text: "le client choisit un créneau libre" },
        { type: "alors", text: "la réservation est confirmée" },
      ]),
    ).toBe(
      "Si un service de 30 minutes et que le client choisit un créneau libre, alors la réservation est confirmée.",
    );
  });

  it("une étape « et » prolonge la partie précédente", () => {
    expect(
      criterionSentence([
        { type: "etant_donne", text: "un client connecté" },
        { type: "et", text: "un créneau libre" },
        { type: "quand", text: "il réserve" },
        { type: "alors", text: "un SMS part" },
        { type: "et", text: "l'agenda se met à jour." },
      ]),
    ).toBe(
      "Si un client connecté et un créneau libre et qu'il réserve, alors un SMS part et l'agenda se met à jour.",
    );
  });

  it("saute une partie absente", () => {
    expect(
      criterionSentence([
        { type: "quand", text: "le client annule" },
        { type: "alors", text: "le créneau est libéré" },
      ]),
    ).toBe("Quand le client annule, alors le créneau est libéré.");
    expect(criterionSentence([{ type: "alors", text: "rien ne change" }])).toBe("Rien ne change.");
  });
});

describe("linkKind", () => {
  it("déduit le type du préfixe ; un parcours garde l'icône de lien", () => {
    expect(linkKind("R-002")).toBe("rule");
    expect(linkKind("RL-accueil")).toBe("role");
    expect(linkKind("S-reservation")).toBe("screen");
    expect(linkKind("NFR-perf")).toBe("nfr");
    expect(linkKind("P-reserver")).toBe("link");
  });
});
