import { describe, expect, it } from "vitest";
import {
  FEATURE_REMINDER_HOURS,
  type NextActionFacts,
  nextActionOf,
} from "./overview-next-action.ts";

const PROJECT = "01900000-0000-7000-8000-000000000001";
const NOW = new Date("2026-11-09T12:00:00.000Z");
const hoursAgo = (hours: number): Date => new Date(NOW.getTime() - hours * 3_600_000);

/** Faits d'un projet en cadrage, vus par un propriétaire, où rien n'attend d'action. */
const base = (over: Partial<NextActionFacts> = {}): NextActionFacts => ({
  projectId: PROJECT,
  audience: "team",
  manager: true,
  canDecideIdea: true,
  canValidate: false,
  phase: "framing",
  now: NOW,
  aiConfigured: true,
  specFailed: false,
  fresh: false,
  proposals: { count: 0, authorName: null },
  missingRequired: { count: 0, firstTitle: null },
  clientName: "Marie Lefèvre",
  functional: { pending: 0, pendingSince: null, revise: 0, teamPending: false },
  proposeNext: null,
  inReviewTickets: 0,
  changeRequest: null,
  ...over,
});
const rule = (over: Partial<NextActionFacts>) => nextActionOf(base(over)).rule;

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe("nextActionOf : une règle à la fois", () => {
  it("1 · IA non configurée (owner/admin)", () => {
    const next = nextActionOf(base({ aiConfigured: false }));
    expect(next).toMatchObject({
      rule: "ai_not_configured",
      tone: "warning",
      title: "L'IA n'est pas configurée pour l'organisation",
      action: { label: "Configurer l'IA", href: "/settings/ai", kind: "link" },
    });
  });

  it("2 · préparation de la spec en échec (owner/admin)", () => {
    const next = nextActionOf(base({ specFailed: true }));
    expect(next).toMatchObject({
      rule: "spec_failed",
      title: "La préparation de la spec a échoué",
      action: { label: "Voir le détail", href: `/projects/${PROJECT}/spec/functional` },
    });
  });

  it("3 · propositions de l'agent en attente, avec le nom de la personne", () => {
    const facts = { phase: "idea", proposals: { count: 2, authorName: "Marie" } } as const;
    const next = nextActionOf(base(facts));
    expect(next.rule).toBe("proposals_pending");
    expect(next.title).toBe("Marie a répondu à l'agent : 2 propositions à relire");
    expect(next.action).toEqual({
      label: "Relire",
      href: `/projects/${PROJECT}/idea`,
      kind: "link",
    });
  });

  it("3 · sans nom, au singulier", () => {
    const next = nextActionOf(base({ phase: "idea", proposals: { count: 1, authorName: null } }));
    expect(next.title).toBe("1 proposition de l'agent à relire");
  });

  it("projet neuf · « Commencez le dossier d'idée »", () => {
    const next = nextActionOf(base({ phase: "idea", fresh: true }));
    expect(next).toMatchObject({
      rule: "new_project",
      tone: "warning",
      title: "Commencez le dossier d'idée",
      action: { label: "Ouvrir l'espace Idée", href: `/projects/${PROJECT}/idea` },
    });
  });

  it("4 · pages requises non stables, bouton nommé d'après la première", () => {
    const next = nextActionOf(
      base({ phase: "idea", missingRequired: { count: 3, firstTitle: "Utilisateurs" } }),
    );
    expect(next.rule).toBe("required_pages");
    expect(next.title).toBe("Il reste 3 pages requises à stabiliser");
    expect(next.action?.label).toBe("Ouvrir Utilisateurs");
    const one = base({ phase: "idea", missingRequired: { count: 1, firstTitle: "Vision" } });
    expect(nextActionOf(one).title).toBe("Il reste 1 page requise à stabiliser");
  });

  it("5 · fonctionnalités sans validation depuis 48 h : « Relancer » copie un lien", () => {
    const functional = { pending: 2, pendingSince: hoursAgo(72), revise: 0, teamPending: false };
    const next = nextActionOf(base({ functional }));
    expect(next.rule).toBe("validation_overdue");
    expect(next.title).toBe("Le cahier fonctionnel attend la validation de Marie Lefèvre");
    expect(next.body).toContain("2 fonctionnalités");
    expect(next.action).toEqual({
      label: "Relancer Marie",
      href: `/projects/${PROJECT}/spec/functional`,
      kind: "copy_link",
    });
  });

  it("6 · changements demandés par le client", () => {
    const functional = { pending: 0, pendingSince: null, revise: 1, teamPending: false };
    const next = nextActionOf(base({ functional }));
    expect(next.rule).toBe("changes_requested");
    expect(next.title).toBe("Marie Lefèvre demande des changements sur le cahier fonctionnel");
    expect(next.action?.label).toBe("Voir les remarques");
  });

  it("« Proposer » le livrable suivant, entre les règles 6 et 7", () => {
    const proposeNext = { label: "le modèle de données", href: `/projects/${PROJECT}/spec/data` };
    const next = nextActionOf(base({ proposeNext }));
    expect(next).toMatchObject({
      rule: "propose_next",
      title: "Proposer le modèle de données",
      action: { label: "Proposer", href: proposeNext.href, kind: "link" },
    });
  });

  it("7 · livrable validé par l'équipe et non validé", () => {
    const functional = { pending: 0, pendingSince: null, revise: 0, teamPending: true };
    const next = nextActionOf(base({ functional, clientName: null }));
    expect(next.rule).toBe("team_validation");
    expect(next.title).toBe("Le cahier fonctionnel reste à valider par l'équipe");
    expect(next.action?.label).toBe("Ouvrir");
  });

  it("8 · tickets en revue en phase Itérations", () => {
    const next = nextActionOf(base({ phase: "iterations", inReviewTickets: 2 }));
    expect(next.rule).toBe("tickets_in_review");
    expect(next.title).toBe("2 tickets attendent une revue de code");
    expect(next.action).toMatchObject({
      label: "Voir les PR",
      href: `/projects/${PROJECT}/tickets`,
    });
    const one = nextActionOf(base({ phase: "iterations", inReviewTickets: 1 }));
    expect(one.title).toBe("1 ticket attend une revue de code");
  });

  it("9 · demande de changement en attente du client (faits injectés)", () => {
    const changeRequest = { key: "CR-2", href: `/projects/${PROJECT}/tickets` };
    const next = nextActionOf(base({ phase: "iterations", changeRequest }));
    expect(next.rule).toBe("change_request");
    expect(next.title).toBe("CR-2 attend la décision de Marie Lefèvre");
  });

  it("rien à faire : carte neutre, sans bouton", () => {
    const next = nextActionOf(base());
    expect(next).toEqual({
      rule: "none",
      tone: "neutral",
      title: "Rien n'attend d'action.",
      body: "",
    });
  });
});

describe("nextActionOf : droits et phases", () => {
  it("les règles 1 et 2 ne s'adressent qu'aux propriétaires et administrateurs", () => {
    expect(rule({ aiConfigured: false, manager: false })).toBe("none");
    expect(rule({ specFailed: true, manager: false })).toBe("none");
  });

  it("les règles de l'Idée ne s'appliquent pas hors de la phase Idée, ni celles du cadrage ailleurs", () => {
    const idea = { proposals: { count: 2, authorName: null } };
    expect(rule({ ...idea, phase: "framing" })).toBe("none");
    const framing = {
      functional: { pending: 1, pendingSince: hoursAgo(99), revise: 1, teamPending: true },
    };
    expect(rule({ ...framing, phase: "idea" })).toBe("none");
    expect(rule({ ...framing, phase: "iterations" })).toBe("none");
    expect(rule({ phase: "framing", inReviewTickets: 4 })).toBe("none");
  });

  it("la première règle qui s'applique gagne (1 avant 2 avant 3, 6 avant 7, 5 avant 6)", () => {
    const all = {
      aiConfigured: false,
      specFailed: true,
      proposals: { count: 1, authorName: null },
    };
    expect(rule({ ...all, phase: "idea" })).toBe("ai_not_configured");
    expect(rule({ ...all, aiConfigured: true, phase: "idea" })).toBe("spec_failed");
    expect(rule({ ...all, aiConfigured: true, specFailed: false, phase: "idea" })).toBe(
      "proposals_pending",
    );
    const functional = { pending: 1, pendingSince: hoursAgo(60), revise: 1, teamPending: true };
    expect(rule({ functional })).toBe("validation_overdue");
    expect(rule({ functional: { ...functional, pending: 0 } })).toBe("changes_requested");
    const proposeNext = { label: "x", href: "/x" };
    expect(rule({ functional: { ...functional, pending: 0, revise: 0 }, proposeNext })).toBe(
      "propose_next",
    );
    expect(
      rule({ phase: "idea", fresh: true, missingRequired: { count: 2, firstTitle: "a" } }),
    ).toBe("new_project");
  });

  it("seuil de 48 h exact : 47 h 59 min n'ouvre pas la règle 5, 48 h pile l'ouvre", () => {
    expect(FEATURE_REMINDER_HOURS).toBe(48);
    const pending = (since: Date) => ({
      pending: 1,
      pendingSince: since,
      revise: 0,
      teamPending: false,
    });
    const justUnder = new Date(hoursAgo(48).getTime() + 1);
    expect(rule({ functional: pending(justUnder) })).toBe("none");
    expect(rule({ functional: pending(hoursAgo(48)) })).toBe("validation_overdue");
    expect(rule({ functional: { ...pending(hoursAgo(99)), pendingSince: null } })).toBe("none");
  });

  it("la règle 5 sans client lié ne relance personne", () => {
    const functional = { pending: 1, pendingSince: hoursAgo(99), revise: 0, teamPending: false };
    expect(rule({ functional, clientName: null })).toBe("none");
  });
});

describe("nextActionOf : vue client (B277)", () => {
  const client = (over: Partial<NextActionFacts> = {}) =>
    nextActionOf(base({ audience: "client", manager: false, canValidate: true, ...over }));

  it("règle 5 formulée pour lui, sans seuil de 48 h et sans « Relancer »", () => {
    const functional = { pending: 2, pendingSince: hoursAgo(1), revise: 0, teamPending: false };
    const next = client({ functional });
    expect(next.rule).toBe("validation_overdue");
    expect(next.title).toBe("Vous avez 2 fonctionnalités à valider");
    expect(next.action).toEqual({
      label: "Ouvrir",
      href: `/projects/${PROJECT}/spec/functional`,
      kind: "link",
    });
  });

  it("règle 3 : seulement si son rôle peut décider", () => {
    const facts = { phase: "idea", proposals: { count: 2, authorName: "Awa" } } as const;
    expect(client(facts).title).toBe("2 propositions de l'agent attendent votre avis");
    expect(client({ ...facts, canDecideIdea: false }).rule).toBe("none");
  });

  it("règles 6 et 7, IA, spec, tickets et projet neuf : jamais pour le client", () => {
    const functional = { pending: 0, pendingSince: null, revise: 2, teamPending: true };
    const facts = { aiConfigured: false, specFailed: true, manager: true, functional, fresh: true };
    expect(client(facts).rule).toBe("none");
    expect(client({ phase: "iterations", inReviewTickets: 3 }).rule).toBe("none");
  });

  it("repli : « Rien n'attend votre action. L'équipe travaille sur … » selon la phase", () => {
    expect(client({ phase: "idea" })).toEqual({
      rule: "none",
      tone: "neutral",
      title: "Rien n'attend votre action.",
      body: "L'équipe travaille sur le dossier d'idée.",
    });
    expect(client({ phase: "framing" }).body).toBe("L'équipe travaille sur le cahier fonctionnel.");
    expect(client({ phase: "iterations" }).body).toBe("L'équipe travaille sur le sprint en cours.");
  });

  it("un rôle qui ne valide pas (business) ne voit pas la règle 5", () => {
    const functional = { pending: 2, pendingSince: hoursAgo(99), revise: 0, teamPending: false };
    expect(client({ functional, canValidate: false }).rule).toBe("none");
  });
});
