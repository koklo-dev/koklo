import type { Item } from "./stub-proposals.ts";

/** Propositions de la Sécurité (TK-117, maquette 15 l.626-630) : menaces, données, droit et section du dossier. */
const LAUNCH_ID = "0190aaaa-0000-7000-8000-000000000001";

export const SECURITY_OPTIONS = {
  options: [
    { id: "threats", count: 3, recommended: true },
    { id: "classify", count: 2, recommended: false },
    { id: "asvs", count: 4, recommended: false },
    { id: "summary", recommended: false },
  ],
  reads: [
    { id: "functional.features", label: "Fonctionnalités exposées" },
    { id: "data.tables", label: "Modèle de données" },
    { id: "technical.current", label: "Cahier technique" },
  ],
  available: true,
};

export const SECURITY_LABELS: Record<string, string> = {
  threat: "Menaces",
  sensitive: "Données sensibles",
  right: "Droits",
  doc_section: "Document · dossier de sécurité",
  summary: "Résumé client",
};

let rank = 0;
const item = (
  kind: Item["kind"],
  title: string,
  rationale: string,
  content: Record<string, unknown>,
): Item => {
  rank += 1;
  return {
    id: `0190eeee-0000-7000-8000-${String(rank).padStart(12, "0")}`,
    launchId: LAUNCH_ID,
    kind,
    zone: "",
    position: rank - 1,
    title,
    rationale,
    content,
    status: "pending",
    appliedBatchId: null,
    createdAt: "2026-11-27T10:00:00.000Z",
  };
};

const threat = (title: string, surface: string, severity: string, when: string, then: string) =>
  item(
    "threat",
    title,
    "Proposé par l'agent depuis la fonctionnalité exposée, ses opérations et les données qu'elle touche.",
    {
      title,
      surfaces: [surface],
      category: "data_leak",
      severity,
      risk: "En demandant un lien, on apprend si un numéro est connu du salon.",
      measures: ["Même réponse et même délai, que le numéro soit connu ou non."],
      verification: "scenario",
      scenario: { when, expected: then },
      links: ["auth.magicLink"],
    },
  );

export const securityItems = (): Item[] => {
  rank = 0;
  return [
    threat(
      "Deviner si un numéro est celui d'une cliente",
      "F-009",
      "low",
      "un numéro inconnu demande un lien",
      "le message est identique à celui d'un numéro connu",
    ),
    threat(
      "Effacement incomplet d'une cliente",
      "F-012",
      "medium",
      "Camille demande l'effacement de ses données",
      "aucune ligne ne la cite plus",
    ),
    item(
      "sensitive",
      "Note de rendez-vous : donnée de santé possible",
      "Proposé par l'agent depuis le modèle de données et l'usage réel du champ dans les parcours.",
      {
        specId: "reservations.note",
        data: "Note de rendez-vous",
        fields: ["reservations.note"],
        category: "sensitive",
        access: ["Coiffeuse du rendez-vous"],
        retentionSuggestion: "1 an",
      },
    ),
    item(
      "right",
      "Export du fichier clients réservé à la gérante",
      "Proposé par l'agent depuis les rôles du cahier fonctionnel.",
      { role: "RL-accueil", permission: "PM-client.exporter", restriction: "Avec second facteur" },
    ),
    item(
      "doc_section",
      "Authentification et sessions",
      "Proposé par l'agent depuis les menaces et le cahier technique.",
      {
        title: "Authentification et sessions",
        markdown:
          "Les clientes se connectent par lien magique ; la gérante ajoute un second facteur.",
      },
    ),
  ];
};

export const securitySummaryItems = (): Item[] => {
  rank = 20;
  return [
    item("summary", "Résumé client", "suite au changement de fournisseur SMS", {
      location:
        "Les SMS passent désormais par OVHcloud, en France. Rien ne sort de l'Union européenne.",
    }),
  ];
};
