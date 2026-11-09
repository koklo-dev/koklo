import type { ProjectOverview } from "@koklo/contract";
import { configure } from "@testing-library/react";
import { PROJECT_ID } from "./web-mocks.ts";

configure({ asyncUtilTimeout: 5_000 });

export { PROJECT_ID };

const KEYS = [
  "functional",
  "data",
  "architecture",
  "technical",
  "security",
  "design",
  "quality",
] as const;

const deliverables = KEYS.map((key) =>
  key === "functional"
    ? {
        key,
        status: "pending" as const,
        content: "7 fonctionnalités",
        done: 4,
        total: 7,
        progressLabel: "4 fonctionnalités validées sur 7",
        validator: "client" as const,
        validatorLabel: "Validation client · obligatoire",
        available: true,
        href: `/projects/${PROJECT_ID}/spec/functional`,
      }
    : {
        key,
        status: "todo" as const,
        content: "Bientôt disponible",
        progressLabel: "À faire",
        validator: "team" as const,
        validatorLabel: "Validation de l'équipe · le client lit et commente",
        available: false,
      },
);

const STEPS = ["idea", "framing", "baseline", "iterations"] as const;
const steps = (current: number) =>
  STEPS.map((key, index) => ({
    key,
    status:
      index < current
        ? ("done" as const)
        : index === current
          ? ("current" as const)
          : ("todo" as const),
    subtitle: `Sous-titre ${key}`,
  }));

/** Vue d'ensemble de Cadrage servie à l'équipe ; chaque test en dérive ses variantes. */
export const FRAMING: ProjectOverview = {
  project: {
    id: PROJECT_ID,
    name: "Portail de réservation",
    startedAt: "2026-10-14T09:00:00.000Z",
    clientContact: "Marie Lefèvre",
  },
  audience: "team",
  phase: "framing",
  phaseSteps: steps(1),
  primaryAction: { label: "Continuer le cadrage", href: `/projects/${PROJECT_ID}/spec/functional` },
  canInvite: true,
  nextAction: {
    rule: "client_waiting",
    tone: "warning",
    title: "Le cahier fonctionnel attend la validation de Marie",
    body: "2 fonctionnalités en attente depuis 3 jours.",
    action: {
      label: "Relancer Marie",
      href: `/projects/${PROJECT_ID}/spec/functional`,
      kind: "copy_link",
    },
  },
  stats: [
    {
      key: "deliverables",
      icon: "inventory_2",
      label: "Livrables validés",
      value: "2 sur 7",
      gauge: { done: 2, total: 7 },
      note: "données et architecture",
    },
    {
      key: "validations",
      icon: "person",
      label: "Validations client attendues",
      value: "0",
      note: "fonctionnel et design",
    },
  ],
  main: { kind: "deliverables", items: deliverables },
  activity: {
    items: [
      {
        actor: { kind: "client", name: "Marie Lefèvre", initials: "ML" },
        text: "Marie a validé F-001 Réserver un créneau",
        at: new Date(Date.now() - 5 * 60_000).toISOString(),
      },
      {
        actor: { kind: "agent", name: "Assistant", initials: "IA" },
        text: "L'agent a proposé 7 fonctionnalités",
        at: "2026-11-01T10:00:00.000Z",
      },
    ],
    total: 214,
  },
  people: {
    items: [
      { name: "Marie Lefèvre", initials: "ML", role: "Client · valide le cadrage", kind: "client" },
      { name: "Awa Koné", initials: "AK", role: "Propriétaire", kind: "team" },
    ],
    others: 2,
  },
};

export const IDEA: ProjectOverview = {
  ...FRAMING,
  phase: "idea",
  phaseSteps: steps(0),
  primaryAction: { label: "Ouvrir l'espace Idée", href: `/projects/${PROJECT_ID}/idea` },
  nextAction: {
    rule: "proposals",
    tone: "warning",
    title: "2 propositions à relire",
    body: "Pages 02 · Utilisateurs et 05 · Périmètre.",
    action: { label: "Relire", href: `/projects/${PROJECT_ID}/idea`, kind: "link" },
  },
  main: {
    kind: "idea",
    pages: [
      { position: 0, title: "Vision", note: "Stable · Awa", status: "stable" },
      { position: 2, title: "Utilisateurs", note: "1 proposition de l'agent", status: "review" },
      { position: 5, title: "Périmètre", note: "Modifié par Marie il y a 5 min", status: "draft" },
    ],
  },
};

export const ITERATIONS: ProjectOverview = {
  ...FRAMING,
  phase: "iterations",
  phaseSteps: steps(3),
  primaryAction: { label: "Ouvrir les tickets", href: `/projects/${PROJECT_ID}/tickets` },
  nextAction: { rule: "none", tone: "neutral", title: "Rien n'attend d'action.", body: "" },
  stats: [
    {
      key: "sprint",
      icon: "flag",
      label: "Sprint SP-7",
      value: "5 sur 8",
      gauge: { done: 5, total: 8 },
      note: "tickets terminés",
    },
  ],
  main: {
    kind: "sprint",
    sprint: { key: "SP-7", goal: "Rendre la réservation fiable" },
    tickets: [
      { key: "TK-104", title: "Déplacer une réservation", note: "PR #42", status: "in_review" },
      { key: "TK-107", title: "Export des réservations", note: "Non commencé", status: "backlog" },
    ],
  },
};

export const CLIENT: ProjectOverview = {
  ...FRAMING,
  audience: "client",
  canInvite: false,
  project: {
    id: PROJECT_ID,
    name: "Portail de réservation",
    startedAt: "2026-10-14T09:00:00.000Z",
  },
  nextAction: {
    rule: "client_to_validate",
    tone: "warning",
    title: "Le cahier fonctionnel attend votre validation",
    body: "2 fonctionnalités à valider.",
    action: { label: "Valider", href: `/projects/${PROJECT_ID}/spec/functional`, kind: "link" },
  },
};
