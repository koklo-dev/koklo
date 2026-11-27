import { describe, expect, it } from "vitest";
import {
  type SecurityHeaderInput,
  securityHeaderStateOf,
} from "../src/lib/security-header-state.ts";

/** TK-117 lot C : en-tête de la Sécurité par état (fiche §10, maquette 15 l.649-669). */
const counts = {
  threats: 18,
  treated: 17,
  todo: 1,
  todoHigh: 1,
  rows: 40,
  classified: 39,
  toDecide: 1,
  scenarios: 14,
  level: 2,
  answered: 5,
  total: 7,
};
const input = (over: Partial<SecurityHeaderInput> = {}): SecurityHeaderInput => ({
  team: true,
  canWrite: true,
  agent: true,
  reviewing: false,
  generating: false,
  pending: 0,
  accepted: 0,
  viewKind: "list",
  counts,
  deliverable: "pending",
  ...over,
});
const VALIDATION = { name: "Moussa", at: "2026-11-06T10:00:00.000Z", sha: "7a3d91e0000" };

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("en-tête de la Sécurité", () => {
  it("liste : statut, résumé avec blocages, « Valider » désactivé", () => {
    const state = securityHeaderStateOf(input());
    expect(state.statusLabel).toBe("Validation de l'équipe · le client lit le résumé");
    expect(state.summary).toBe(
      "18 menaces · 17 traitées · 39 données classées · 14 scénarios d'abus · ASVS niveau 2 · 1 menace élevée sans parade et 1 donnée à classer avant de valider",
    );
    expect(state.actions).toEqual(["propose", "create-threat", "validate"]);
    expect(state.validateBlocked).toBe(true);
  });

  it("sans blocage : « Valider » actif ; comptes non lus : désactivé", () => {
    const free = securityHeaderStateOf(input({ counts: { ...counts, todoHigh: 0, toDecide: 0 } }));
    expect(free.validateBlocked).toBeUndefined();
    expect(free.summary).not.toContain("avant de valider");
    expect(securityHeaderStateOf(input({ counts: undefined })).validateBlocked).toBe(true);
  });

  it("pluriels des blocages", () => {
    const state = securityHeaderStateOf(input({ counts: { ...counts, todoHigh: 2, toDecide: 3 } }));
    expect(state.summary).toContain(
      "2 menaces élevées sans parade et 3 données à classer avant de valider",
    );
  });

  it("comptes des onglets : Menaces, Données, Exigences « 5/7 » seulement s'il manque des réponses", () => {
    expect(securityHeaderStateOf(input()).tabCounts).toEqual({
      threats: { value: 18 },
      data: { value: 40 },
      reqs: { value: "5/7" },
    });
    const covered = securityHeaderStateOf(input({ counts: { ...counts, answered: 7 } }));
    expect(covered.tabCounts?.reqs).toBeUndefined();
  });

  it("validé : décision écrite, plus de « Valider »", () => {
    const state = securityHeaderStateOf(
      input({ deliverable: "validated", validation: VALIDATION }),
    );
    expect(state.statusLabel).toBe("Validé par l'équipe");
    expect(state.summary).toBe(
      "Validé par Moussa le 6 nov. · version 7a3d91e · le résumé rejoint la baseline 0",
    );
    expect(state.actions).toEqual(["propose", "create-threat"]);
  });

  it("à revoir : « Proposer les mises à jour » (absent si l'agent est fermé) et « Valider »", () => {
    const base = { deliverable: "revise" as const, validation: VALIDATION };
    const state = securityHeaderStateOf(input(base));
    expect(state.status).toBe("revise");
    expect(state.actions).toEqual(["create-threat", "propose-updates", "validate"]);
    expect(securityHeaderStateOf(input({ ...base, available: false })).actions).toEqual([
      "create-threat",
      "validate",
    ]);
  });

  it("à revoir : le résumé dit pourquoi « Valider » est désactivé, et rien de plus sinon", () => {
    const base = { deliverable: "revise" as const, validation: VALIDATION };
    const dated = "Validé le 6 nov., le cahier technique a changé depuis";
    const blocked = securityHeaderStateOf(input(base));
    expect(blocked.validateBlocked).toBe(true);
    expect(blocked.summary).toBe(
      `${dated} · 1 menace élevée sans parade et 1 donnée à classer avant de valider`,
    );
    const free = { ...counts, todoHigh: 0, toDecide: 0 };
    const open = securityHeaderStateOf(input({ ...base, counts: free }));
    expect(open.validateBlocked).toBeUndefined();
    expect(open.summary).toBe(dated);
  });

  it("prêt, génération et relecture", () => {
    expect(securityHeaderStateOf(input({ viewKind: "empty" }))).toMatchObject({
      status: "ready",
      summary: "Le technique est validé",
      actions: [],
    });
    expect(securityHeaderStateOf(input({ reviewing: true, generating: true })).status).toBe(
      "generating",
    );
    const review = securityHeaderStateOf(input({ reviewing: true, pending: 5, accepted: 2 }));
    expect(review.summary).toBe("5 propositions à relire · 2 acceptées");
    expect(review.actions).toEqual(["add", "repropose"]);
    expect(review.tabCounts?.review).toEqual({ value: 5, tone: "primary" });
  });

  it("designer : lecture sans action ; hors équipe : rien", () => {
    expect(securityHeaderStateOf(input({ canWrite: false, agent: false })).actions).toEqual([]);
    expect(securityHeaderStateOf(input({ team: false }))).toEqual({ actions: [] });
  });
});
