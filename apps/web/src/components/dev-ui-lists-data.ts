import type { LifecycleStage } from "@koklo/ui";

/**
 * Données fictives de la section « Listes longues » de la galerie `/dev/ui` (fiche S-dev-ui §3) :
 * 1 000 lignes calculées à la demande, jamais d'appel d'API, aucune valeur de couleur.
 */
export const LIST_TOTAL = 1000;
export const LIST_PAGE = 50;

export interface DemoFeature {
  id: string;
  title: string;
  stage: LifecycleStage;
}

const VERBS = [
  "Annuler",
  "Réserver",
  "Déplacer",
  "Confirmer",
  "Rappeler",
  "Exporter",
  "Partager",
  "Archiver",
];
const OBJECTS = [
  "une réservation",
  "un créneau",
  "une salle",
  "un forfait",
  "la liste d'attente",
  "un groupe",
  "un paiement",
  "un rappel",
];

/** Fonctionnalité fictive de rang `index` (à partir de 0) : identifiant `F-001`, titre tournant, étape tournante. */
export function demoFeature(index: number): DemoFeature {
  const verb = VERBS[index % VERBS.length] as string;
  const object = OBJECTS[Math.floor(index / VERBS.length) % OBJECTS.length] as string;
  return {
    id: `F-${String(index + 1).padStart(3, "0")}`,
    title: `${verb} ${object}`,
    stage: (index % 6) as LifecycleStage,
  };
}

export function demoFeatures(count: number): DemoFeature[] {
  return Array.from({ length: count }, (_, index) => demoFeature(index));
}

export const DEMO_ZONES = [
  {
    name: "Réservation",
    count: 14,
    preview: ["reservation", "creneau", "annulation", "salle", "horaire"],
    links: "→ 12 liens vers Clients, Paiement…",
  },
  {
    name: "Clients",
    count: 9,
    preview: ["client", "consentement", "adresse"],
    links: "→ 5 liens vers Réservation",
  },
  {
    name: "Paiement",
    count: 7,
    preview: ["facture", "reglement"],
    links: "→ 3 liens vers Clients",
  },
] as const;

export const MINIMAP = {
  world: { width: 1400, height: 700 },
  nodes: [
    { id: "reservation", x: 80, y: 80, width: 420, height: 240, active: true },
    { id: "clients", x: 640, y: 120, width: 340, height: 200 },
    { id: "paiement", x: 360, y: 440, width: 300, height: 180 },
  ],
  viewport: { x: 40, y: 40, width: 620, height: 330 },
} as const;
