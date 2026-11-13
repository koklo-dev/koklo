import type { SpecDeliverable } from "@koklo/contract";
import { describe, expect, it } from "vitest";
import { specBadges } from "../src/lib/spec-badges.ts";

/** TK-102 lot B : pastille de la barre (maquette 10 l.686-712), « N à relire » avant le statut, un seul badge par entrée. */
const base = (over: Partial<SpecDeliverable>): SpecDeliverable => ({
  key: "functional",
  status: "todo",
  available: true,
  forced: false,
  condition: null,
  pendingProposals: 0,
  ...over,
});

describe("specBadges", () => {
  it("propositions en attente : « 3 à relire » en primary, avant tout statut", () => {
    expect(specBadges([base({ pendingProposals: 3, status: "pending" })])).toEqual({
      functional: { label: "3 à relire", tone: "primary" },
    });
  });

  it("sinon le statut : À valider et À revoir en ambre, Prêt en soft pour un livrable ouvert à faire", () => {
    expect(
      specBadges([
        base({ status: "pending" }),
        base({ key: "data", status: "revise" }),
        base({ key: "design", status: "todo" }),
      ]),
    ).toEqual({
      functional: { label: "À valider", tone: "pending" },
      data: { label: "À revoir", tone: "pending" },
      design: { label: "Prêt", tone: "soft" },
    });
  });

  it("génération en cours : « … » en soft sur le Fonctionnel ouvert, avant « N à relire »", () => {
    expect(specBadges([base({ pendingProposals: 2 })], new Set(["functional"]))).toEqual({
      functional: { label: "…", tone: "soft" },
    });
    expect(specBadges([base({ key: "data" })], new Set(["functional"]))).toEqual({
      data: { label: "Prêt", tone: "soft" },
    });
    expect(specBadges([base({ key: "data" })], new Set(["data"]))).toEqual({
      data: { label: "…", tone: "soft" },
    });
    expect(specBadges([base({ available: false })], new Set(["functional"]))).toEqual({});
  });

  it("validé, verrouillé ou sans donnée : aucune pastille", () => {
    expect(specBadges([base({ status: "validated" })])).toEqual({});
    expect(specBadges([base({ available: false, pendingProposals: 2 })])).toEqual({});
    expect(specBadges(undefined)).toEqual({});
  });
});
