import type { Item } from "./stub-proposals.ts";

/** Propositions du cahier technique (TK-115, maquette 14 l.737-741) : 36, au-delà de 30 : groupées par type. */
const LAUNCH_ID = "0190aaaa-0000-7000-8000-000000000001";

export const TECHNICAL_LABELS: Record<string, string> = {
  doc_section: "Document · cahier technique",
  stack: "Stack",
  op: "Opérations de l'API",
  nfr: "Exigences",
  env: "Environnements",
};

export const TECHNICAL_OPTIONS = {
  options: [
    { id: "complete", recommended: true },
    { id: "compare", count: 2, recommended: false },
    { id: "nfr", recommended: false },
    { id: "all", recommended: false },
  ],
  reads: [
    { id: "architecture.current", label: "Architecture validée" },
    { id: "nfr.known", label: "Exigences" },
  ],
  available: true,
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
    id: `0190dddd-0000-7000-8000-${String(rank).padStart(12, "0")}`,
    launchId: LAUNCH_ID,
    kind,
    zone: "",
    position: rank - 1,
    title,
    rationale,
    content,
    status: "pending",
    appliedBatchId: null,
    createdAt: "2026-11-27T09:00:00.000Z",
  };
};

const WHY = "Rédigée à partir de l'architecture et de ses décisions.";

const sections = (): Item[] =>
  [
    [
      "Gestion des incidents",
      "Toute erreur de réservation déclenche une alerte en moins de 5 minutes.\nL'astreinte est tenue par l'équipe, à tour de rôle.\nLe retour arrière prend moins de 5 minutes.",
    ],
    ["Tests et qualité", "Trois niveaux de tests : unitaires, intégration et bout en bout."],
    ["Charge", "Un test de charge en recette avant chaque version."],
    ["Sauvegardes", "Sauvegarde quotidienne chiffrée, restauration testée chaque trimestre."],
  ].map(([title, markdown]) => item("doc_section", title as string, WHY, { title, markdown }));

const stacks = (): Item[] =>
  [
    "Fournisseur SMS",
    "Fournisseur e-mail",
    "Base de données",
    "File de tâches",
    "Authentification",
    "API",
    "Applications web",
    "Hébergement",
    "Erreurs et journaux",
    "Intégration et déploiement",
  ].map((role, index) =>
    // Titre rendu par le serveur : le seul rôle. Le premier choix est proposé tranché.
    item("stack", role, "L'agent compare les offres connues.", {
      role,
      ...(index === 0 ? { status: "chosen", choice: "Brevo" } : { status: "open" }),
      components: ["C-sms"],
      options: ["Brevo", "Twilio"],
      criteria: [{ label: "Données en UE", values: ["Oui", "Non par défaut"] }],
      why: "SMS et e-mail chez le même prestataire, données en UE.",
      plain: "Le prestataire qui enverra les rappels aux clients.",
      requirements: [],
      decisions: ["ADR-006"],
    }),
  );

const operations = (): Item[] =>
  Array.from({ length: 12 }, (_, i) => {
    const name = `reservation.action${i + 1}`;
    return item("op", name, "Déduite de F-001 et du composant C-api.", {
      name,
      type: i % 3 === 0 ? "read" : "write",
      zone: "rdv",
      component: "C-api",
      summary: "Gère une réservation.",
      permission: "public",
      input: [{ field: "creneauId", type: "uuid", constraint: "créneau libre" }],
      output: [],
      errors: [{ code: "CRENEAU_PRIS", when: "le créneau n'est plus libre" }],
      rules: ["R-001"],
      features: ["F-001"],
    });
  });

const requirements = (): Item[] =>
  Array.from({ length: 7 }, (_, i) =>
    item("nfr", `Exigence ${i + 1}`, "Tirée des contraintes du dossier d'idée.", {
      category: "performance",
      title: `Exigence ${i + 1}`,
      target: "p95 < 300 ms",
      statement: "Les réservations répondent vite.",
      verification: "ci_measure",
      links: [],
    }),
  );

const environments = (): Item[] =>
  ["Développement", "Recette", "Production"].map((name) =>
    item("env", name, "Proposé à partir du choix d'hébergement.", {
      name,
      address: "recette.atelier-lumiere.fr",
      hosting: "Scaleway · Paris",
      database: "PostgreSQL géré",
      data: "sample",
    }),
  );

export function technicalItems(): Item[] {
  rank = 0;
  return [...sections(), ...stacks(), ...operations(), ...requirements(), ...environments()];
}
