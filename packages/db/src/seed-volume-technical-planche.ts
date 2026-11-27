/**
 * Les 24 choix de la planche « Volume réel » du cahier technique (maquette 14, B736) : les dix rôles détaillés, puis les
 * quatorze rôles ajoutés au volume réel. Deux sont à trancher (`ST-sms` et le paiement en ligne). Données fictives.
 */
type Layer = "applications" | "services" | "donnees" | "externes" | "exploitation";

interface Detail {
  icon?: string;
  components?: readonly number[];
  options: readonly string[];
  criteria: readonly (readonly [string, readonly string[]])[];
  why: string;
  requirements?: readonly number[];
  decisions?: readonly number[];
  plain?: string;
  /** Valeurs chiffrées estimées. */
  estimated?: string;
}

const number = (value: number) => String(value).padStart(3, "0");

/** Un choix au format d'index ; `choice` nul : à trancher, la première option est recommandée. */
function stack(id: string, couche: Layer, role: string, choice: string | null, detail: Detail) {
  const { icon, components = [2], requirements = [], decisions = [] } = detail;
  return {
    id: `ST-${id}`,
    couche,
    ...(icon === undefined ? {} : { icone: icon }),
    role,
    titre: `${role} : ${choice ?? "à trancher"}`,
    statut: choice === null ? "a_trancher" : "choisi",
    ...(choice === null ? {} : { choix: choice }),
    recommande: detail.options[0],
    composants: components.map((n) => `C-composant-${number(n)}`),
    options: detail.options,
    criteres: detail.criteria.map(([nom, valeurs]) => ({
      nom,
      ...(nom === detail.estimated ? { estimation: true } : {}),
      valeurs,
    })),
    pourquoi: detail.why,
    ...(detail.plain === undefined ? {} : { en_clair: detail.plain }),
    exigences: requirements.map((n) => `NFR-${number(n)}`),
    decisions: decisions.map((n) => `ADR-${number(n)}`),
  };
}

/** Rôle ajouté au volume réel : une alternative, un seul critère. */
const extra = (id: string, couche: Layer, role: string, choice: string, icon?: string) =>
  stack(id, couche, role, choice, {
    ...(icon === undefined ? {} : { icon }),
    options: [choice, "Alternative"],
    criteria: [["Adéquation", ["Bonne", "Moyenne"]]],
    why: `Choix proposé par l'agent pour ${role.toLowerCase()}.`,
  });

const DETAILED = [
  stack("web", "applications", "Applications web", "Next.js 15 · React 19", {
    icon: "web",
    components: [1, 6],
    options: ["Next.js", "Remix", "Application Vite"],
    criteria: [
      ["Rapidité sur mobile", ["Très bonne", "Très bonne", "Moyenne"]],
      ["Compétence de l'équipe", ["Forte", "Faible", "Forte"]],
      ["Hébergement", ["Partout", "Partout", "Fichiers statiques"]],
    ],
    why: "Rendu côté serveur pour un portail rapide sur téléphone (NFR-002) ; un seul cadre pour le portail et le back-office.",
    requirements: [2, 6],
    decisions: [2],
    plain: "Les deux sites sont construits avec le même outil, rapide sur téléphone.",
  }),
  stack("api", "services", "API", "Node.js 22 · oRPC", {
    icon: "hub",
    options: ["oRPC", "tRPC", "REST + OpenAPI"],
    criteria: [
      ["Contrat typé", ["Oui", "Oui", "Généré"]],
      ["Ouverture à des tiers", ["OpenAPI exportable", "Non", "Native"]],
      ["Compétence de l'équipe", ["Forte", "Forte", "Forte"]],
    ],
    why: "Contrat typé partagé avec les applications (ADR-002) ; un seul langage de bout en bout.",
    requirements: [3],
    decisions: [2],
  }),
  stack("auth", "services", "Authentification", "Better Auth · lien magique", {
    icon: "key",
    options: ["Better Auth", "Auth.js", "Service géré"],
    criteria: [
      ["Lien magique", ["Natif", "Natif", "Natif"]],
      ["Données en UE", ["Oui, notre base", "Oui", "Selon l'offre"]],
      ["Coût", ["0 €", "0 €", "Par utilisateur"]],
    ],
    why: "Lien magique natif (ADR-004), sessions en base, aucun service tiers à payer.",
    requirements: [7],
    decisions: [4],
  }),
  stack("db", "donnees", "Base de données", "PostgreSQL 17", {
    icon: "database",
    options: ["PostgreSQL", "MySQL", "SQLite"],
    criteria: [
      [
        "Contraintes et transactions",
        ["Complètes", "Complètes", "Écritures concurrentes limitées"],
      ],
      ["File de tâches intégrée", ["Oui", "Non", "Non"]],
      ["Offre gérée en France", ["Oui", "Oui", "—"]],
    ],
    why: "Base relationnelle pour l'unicité des créneaux (ADR-007), chiffrée au repos chez l'hébergeur (ADR-005).",
    requirements: [1, 8],
    decisions: [5, 7],
    plain: "Les réservations sont rangées dans une base fiable, chiffrée, hébergée en France.",
  }),
  stack("queue", "donnees", "File de tâches", "pg-boss, dans PostgreSQL", {
    icon: "queue",
    components: [3, 4],
    options: ["pg-boss", "Redis + BullMQ", "File gérée"],
    criteria: [
      ["Service en plus", ["Aucun", "Redis", "Oui"]],
      ["Tâches datées", ["Oui", "Oui", "Oui"]],
      ["Débit", ["Suffisant", "Très élevé", "Très élevé"]],
    ],
    why: "Aucun service de plus à opérer : la file vit dans la base (ADR-003).",
    decisions: [3],
  }),
  stack("sms", "externes", "Fournisseur SMS", null, {
    icon: "sms",
    components: [5],
    options: ["Brevo", "Twilio", "OVHcloud SMS"],
    criteria: [
      ["Prix estimé par SMS en France", ["≈ 0,045 €", "≈ 0,07 €", "≈ 0,04 €"]],
      ["Données en UE", ["Oui", "Non par défaut", "Oui"]],
      ["E-mail chez le même", ["Oui", "Oui", "Non"]],
      ["Avis de l'agent", ["Recommandé", "—", "Alternative"]],
    ],
    estimated: "Prix estimé par SMS en France",
    why: "L'agent recommande Brevo : SMS et e-mail chez le même prestataire, données en UE. Les prix sont des estimations à vérifier avant de choisir.",
    requirements: [1],
    decisions: [6],
    plain: "Le prestataire qui enverra les rappels SMS reste à choisir.",
  }),
  stack("mail", "externes", "Fournisseur e-mail", "Brevo", {
    icon: "mail",
    components: [7],
    options: ["Brevo", "Postmark", "Amazon SES"],
    criteria: [
      ["Délivrabilité", ["Bonne", "Excellente", "Bonne"]],
      ["Données en UE", ["Oui", "Non", "Région UE"]],
    ],
    why: "Liens de connexion et confirmations ; même compte que les SMS si Brevo est retenu.",
    decisions: [4],
  }),
  stack("host", "exploitation", "Hébergement", "Scaleway, Paris", {
    icon: "cloud",
    components: [1, 6, 2, 4, 8],
    options: ["Scaleway", "OVHcloud", "Vercel + Neon"],
    criteria: [
      ["Données en France", ["Oui", "Oui", "Région UE"]],
      ["Base gérée", ["Oui", "Oui", "Oui"]],
      ["Simplicité de déploiement", ["Bonne", "Moyenne", "Excellente"]],
    ],
    why: "Hébergement en France demandé par le client (NFR-001), base gérée avec sauvegardes quotidiennes.",
    requirements: [1, 5],
    decisions: [1],
    plain: "Le produit est hébergé en France, à Paris.",
  }),
  stack("obs", "exploitation", "Erreurs et journaux", "Sentry · journaux de l'hébergeur", {
    icon: "monitoring",
    components: [2, 4, 1],
    options: ["Sentry", "Journaux seuls"],
    criteria: [
      ["Alerte en temps réel", ["Oui", "Non"]],
      ["Coût", ["Offre gratuite", "0 €"]],
    ],
    why: "Alerte immédiate sur toute erreur de réservation (NFR-005).",
    requirements: [5],
  }),
  stack("ci", "exploitation", "Intégration et déploiement", "GitHub Actions", {
    icon: "rocket_launch",
    components: [],
    options: ["GitHub Actions", "GitLab CI"],
    criteria: [["Dépôt déjà sur", ["GitHub", "—"]]],
    why: "Le dépôt de code est sur GitHub ; la recette se déploie à chaque fusion, la production sur validation.",
    requirements: [6],
  }),
];

const ADDED = [
  extra("011", "applications", "Génération de PDF", "Rendu serveur (Typst)"),
  extra("012", "services", "Recherche", "Plein texte PostgreSQL", "search"),
  stack("013", "services", "Paiement en ligne", null, {
    icon: "payments",
    options: ["Stripe", "Mollie", "Paiement sur place"],
    criteria: [
      ["Commission estimée", ["≈ 1,5 % + 0,25 €", "≈ 1,8 % + 0,25 €", "0 €"]],
      ["Effort", ["Moyen", "Moyen", "Aucun"]],
    ],
    estimated: "Commission estimée",
    why: "F-005 est reportée : l'agent compare trois options pour la suite.",
  }),
  extra("014", "services", "Envoi groupé", "pg-boss"),
  extra("015", "donnees", "Stockage des images", "Scaleway Object Storage"),
  extra("016", "donnees", "Cache", "Cache HTTP de l'hébergeur"),
  extra("017", "donnees", "Sauvegardes", "Sauvegarde gérée quotidienne"),
  extra("018", "externes", "Prestataire de paiement", "Stripe", "payments"),
  extra("019", "externes", "Export comptable", "Fichier FEC généré"),
  extra("020", "exploitation", "CDN", "CDN de l'hébergeur", "cloud"),
  extra("021", "exploitation", "Tests de bout en bout", "Playwright"),
  extra("022", "exploitation", "Qualité du code", "Biome · TypeScript strict"),
  extra("023", "exploitation", "Gestion des secrets", "Coffre de l'hébergeur", "key"),
  extra("024", "exploitation", "Sonde de disponibilité", "Sonde externe", "monitoring"),
];

export const PLANCHE_STACKS = [...DETAILED, ...ADDED];
