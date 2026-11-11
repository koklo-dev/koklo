import type {
  ProposalDecision,
  ProposalFilter,
  ProposalReviewCounts,
  ProposalReviewGroup,
  ProposalReviewItem,
  ProposalStatus,
} from "@koklo/ui";

/** Données simulées de la galerie /dev/ui, section 14 : jamais une donnée réelle ni un appel au serveur. */
export interface DemoCriterion {
  id: string;
  title: string;
  given: string;
  when: string;
  outcome: string;
}

export interface DemoProposal {
  id: string;
  ref: string;
  title: string;
  type: "feature" | "criteria";
  zone: string;
  priority: string;
  why: string;
  description: string;
  criteria: DemoCriterion[];
}

const ZONES = [
  "Réservation",
  "Facturation",
  "Dossier client",
  "Agenda",
  "Notifications",
  "Administration",
];
const SUBJECTS = ["rendez-vous", "facture", "rappel", "créneau", "document", "paiement", "compte"];
const VERBS = [
  "Réserver un",
  "Annuler un",
  "Consulter un",
  "Exporter un",
  "Relancer un",
  "Partager un",
];
const PRIORITIES = ["Haute", "Moyenne", "Basse"];

export const TYPE_LABEL = { feature: "Fonctionnalités", criteria: "Critères" } as const;

function criteriaFor(n: number): DemoCriterion[] {
  return [1, 2].map((k) => ({
    id: `AC-${n}-${k}`,
    title: k === 1 ? "Cas nominal" : "Cas limite",
    given: "un client connecté avec un dossier ouvert",
    when: k === 1 ? "il valide sa demande" : "il valide sa demande hors des horaires d'ouverture",
    outcome:
      k === 1
        ? "la demande est enregistrée et confirmée"
        : "un message explique le prochain créneau possible",
  }));
}

export function demoProposals(count: number): DemoProposal[] {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    const type = n % 5 === 0 ? "criteria" : "feature";
    const zone = ZONES[i % ZONES.length] as string;
    const title = `${VERBS[i % VERBS.length]} ${SUBJECTS[i % SUBJECTS.length]}`;
    return {
      id: `p${n}`,
      ref: `${type === "feature" ? "F" : "C"}-${String(n).padStart(3, "0")}`,
      title,
      type,
      zone,
      priority: PRIORITIES[i % PRIORITIES.length] as string,
      why: "Le dossier d'idée fait de ce parcours un besoin récurrent de la clinique.",
      description: `${title} depuis l'espace client, sans appeler la clinique.`,
      criteria: criteriaFor(n),
    };
  });
}

export function subtitleOf(p: DemoProposal): string {
  const kind = p.type === "feature" ? "Fonctionnalité" : "Critère";
  return `${kind} · ${p.priority} · ${p.criteria.length} critères`;
}

export type Decisions = Readonly<Record<string, ProposalDecision>>;

const statusOf = (decisions: Decisions, id: string): ProposalStatus => {
  const d = decisions[id];
  return d === undefined || d === "pending" ? "pending" : d;
};

function toItem(p: DemoProposal, decisions: Decisions): ProposalReviewItem {
  return {
    id: p.id,
    ref: p.ref,
    title: p.title,
    subtitle: subtitleOf(p),
    status: statusOf(decisions, p.id),
  };
}

export function countsOf(
  proposals: readonly DemoProposal[],
  decisions: Decisions,
): ProposalReviewCounts {
  const status = (p: DemoProposal) => statusOf(decisions, p.id);
  const count = (s: ProposalStatus) => proposals.filter((p) => status(p) === s).length;
  return {
    total: proposals.length,
    accepted: count("accepted"),
    rejected: count("rejected"),
    pending: count("pending"),
  };
}

/** À 30 propositions ou moins : un seul groupe `all` ; au-delà : un groupe par type et zone, 8 éléments chargés puis +20. */
export function groupsOf(
  proposals: readonly DemoProposal[],
  decisions: Decisions,
  filter: ProposalFilter,
  shown: Readonly<Record<string, number>>,
): ProposalReviewGroup[] {
  if (proposals.length <= 30) {
    const items = proposals.map((p) => toItem(p, decisions));
    const { accepted, pending } = countsOf(proposals, decisions);
    return [
      {
        key: "all",
        label: "Toutes",
        counts: { total: items.length, accepted, pending },
        matching: items.length,
        items,
      },
    ];
  }
  const keys = [...new Set(proposals.map((p) => `${p.type}:${p.zone}`))];
  return keys.map((key) => {
    const own = proposals.filter((p) => `${p.type}:${p.zone}` === key);
    const first = own[0] as DemoProposal;
    const matching = own.filter((p) => filter === "all" || statusOf(decisions, p.id) === "pending");
    const { accepted, pending } = countsOf(own, decisions);
    return {
      key,
      label: `${TYPE_LABEL[first.type]} · ${first.zone}`,
      counts: { total: own.length, accepted, pending },
      matching: matching.length,
      items: matching.slice(0, shown[key] ?? 8).map((p) => toItem(p, decisions)),
    };
  });
}
