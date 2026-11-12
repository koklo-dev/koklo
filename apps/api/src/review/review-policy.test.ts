import { describe, expect, it } from "vitest";
import {
  canReview,
  clientListFilter,
  isDelegatedTarget,
  REMINDERS,
  type ReviewKind,
} from "./review-policy.ts";

/**
 * TK-100 lot B (B325 d, D1) : qui valide quelle cible. Fonctionnel (fonctionnalité, parcours, règles, rôles, livrable
 * `functional`) et Design : le client s'il y en a un d'invité, sinon owner ou admin. Données, Architecture, Technique,
 * Sécurité, Qualité : owner, admin, développeur. Baseline : le client seul. Designer, business, écran : jamais.
 */
const ROLES = ["owner", "admin", "dev", "designer", "business", "client", "", "agent"] as const;
const allowed = (kind: ReviewKind, ref: string, hasClient: boolean) =>
  ROLES.filter((role) => canReview(role, kind, ref, hasClient));

const D1_TARGETS: [ReviewKind, string][] = [
  ["feature", "F-001"],
  ["flow", "P-001"],
  ["rules", "rules"],
  ["roles", "roles"],
  ["deliverable", "functional"],
  ["deliverable", "design"],
];
const TECH_DELIVERABLES = ["data", "architecture", "technical", "security", "quality"];

describe("D1 : cibles fonctionnelles et Design", () => {
  it.each(D1_TARGETS)("%s %s : le client seul quand un client est invité", (kind, ref) => {
    expect(allowed(kind, ref, true)).toEqual(["client"]);
  });

  it.each(D1_TARGETS)("%s %s : owner ou admin sans client invité", (kind, ref) => {
    expect(allowed(kind, ref, false)).toEqual(["owner", "admin"]);
  });
});

describe("cibles techniques", () => {
  it.each(TECH_DELIVERABLES)("livrable %s : owner, admin, dev, avec ou sans client", (ref) => {
    expect(allowed("deliverable", ref, true)).toEqual(["owner", "admin", "dev"]);
    expect(allowed("deliverable", ref, false)).toEqual(["owner", "admin", "dev"]);
  });

  it("un client ne valide ni Données, ni Architecture, ni Technique, ni Sécurité, ni Qualité", () => {
    for (const ref of TECH_DELIVERABLES)
      expect(canReview("client", "deliverable", ref, true)).toBe(false);
  });
});

describe("baseline et refus par défaut", () => {
  it("baseline : le client seul, jamais l'équipe (D1 de la Baseline 0 relève de TK-104)", () => {
    expect(allowed("baseline", "baseline-0", true)).toEqual(["client"]);
    expect(allowed("baseline", "baseline-0", false)).toEqual(["client"]);
  });

  it("designer, business, rôle vide ou inconnu : refusés sur toutes les cibles", () => {
    for (const [kind, ref] of [
      ...D1_TARGETS,
      ["baseline", "baseline-0"],
      ["deliverable", "data"],
    ] as [ReviewKind, string][]) {
      for (const hasClient of [true, false]) {
        for (const role of ["designer", "business", "", "agent", "runner"]) {
          expect(canReview(role, kind, ref, hasClient), `${role} ${kind} ${ref}`).toBe(false);
        }
      }
    }
  });

  it("un livrable inconnu n'est validable par personne", () => {
    expect(allowed("deliverable", "screens", false)).toEqual([]);
  });
});

describe("validation déléguée (onBehalf) et lecture du client", () => {
  it("les cibles D1 sont déléguables à l'équipe ; techniques et baseline non", () => {
    for (const [kind, ref] of D1_TARGETS)
      expect(isDelegatedTarget(kind, ref), `${kind} ${ref}`).toBe(true);
    expect(isDelegatedTarget("deliverable", "data")).toBe(false);
    expect(isDelegatedTarget("baseline", "baseline-0")).toBe(false);
  });

  it("le client ne lit que les cibles qu'il valide : jamais Données, Architecture, Technique, Sécurité, Qualité", () => {
    const filter = clientListFilter();
    expect(JSON.stringify(filter)).toContain("functional");
    expect(JSON.stringify(filter)).toContain("design");
    for (const key of TECH_DELIVERABLES) expect(JSON.stringify(filter)).not.toContain(key);
  });
});

describe("TK-104 (B352) : relancer le client", () => {
  it("owner et admin seulement, jamais le client, le business, le développeur, le designer ni un agent", () => {
    expect(ROLES.filter((role) => REMINDERS.includes(role))).toEqual(["owner", "admin"]);
  });
});
