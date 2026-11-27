import type { SpecDeliverable, StackSummary, TechnicalEnvironments } from "@koklo/contract";
import { formatCount, type IconName, iconNameOr, type PillTone } from "@koklo/ui";

/** Libellés de la page Technique (TK-115, maquette 14) : un seul endroit pour les phrases et les vocabulaires. */
export const TECHNICAL_TITLE = "Cahier technique";
export const TECHNICAL_READY_TITLE = "L'agent peut proposer le cahier technique";
export const TECHNICAL_READY_TEXT =
  "À partir de l'architecture validée : un choix technique par composant avec ses alternatives, les opérations de l'API, les exigences non fonctionnelles mesurables et les environnements. Vous relisez tout avant que rien n'entre dans la spec.";
export const TECHNICAL_GENERATING =
  "L'agent rédige le cahier technique : la stack d'abord, puis les opérations de l'API zone par zone et les exigences. Les premières propositions arrivent avant la fin. Vous pouvez quitter la page.";
export const TECHNICAL_ERROR_TITLE = "Impossible de charger le cahier technique";
export const TECHNICAL_DIALOG_SUBTITLE = "Cahier technique";
export const TECHNICAL_DIALOG_PLACEHOLDER = "ex. « compare trois fournisseurs SMS français »";

export const STACK_LAYERS = ["applications", "services", "data", "external", "operations"] as const;
export const STACK_LAYER_LABELS: Record<StackSummary["layer"], string> = {
  applications: "Applications",
  services: "Services et API",
  data: "Données",
  external: "Services externes",
  operations: "Hébergement et exploitation",
};
export const STACK_NOTE =
  "Un choix par rôle de l'architecture · les produits ne sont nommés qu'ici";
export const STACK_SEARCH_LABEL = "Rechercher un choix technique";
export const STACK_NOUN = { one: "choix", other: "choix", masculine: true };
export const CHOICE_SAVED = "Choix enregistré";
export const ENVIRONMENT_SAVED = "Environnement enregistré";
export const OPEN_CHOICE = "À trancher";

/** « queue » n'existe pas dans le jeu Material : « lists » (DESIGN.md §5.23). */
export const stackIconOf = (icon: string | undefined): IconName =>
  iconNameOr(icon === "queue" ? "lists" : icon, "layers");

const SHOWN_COMPONENTS = 3;

/** « Pour C-portail, C-api +2 » ou « Pour toute l'équipe » (maquette 14 l.569). */
export function forTextOf(components: readonly string[]): string {
  if (components.length === 0) return "Pour toute l'équipe";
  const shown = components.slice(0, SHOWN_COMPONENTS).join(", ");
  const more = components.length - SHOWN_COMPONENTS;
  return `Pour ${shown}${more > 0 ? ` +${more}` : ""}`;
}

const COUNT_WORDS = ["zéro", "une", "deux", "trois", "quatre", "cinq", "six", "sept", "huit"];

/** Encadré d'un choix ouvert (maquette 14 l.198), avec le nombre réel d'options. */
export function openChoiceText(options: number): string {
  const count = COUNT_WORDS[options] ?? String(options);
  return `Choix à faire avant la validation du cahier technique. L'agent a comparé ${count} options ; choisissez-en une ou demandez une autre comparaison.`;
}

export const DATA_LABELS = {
  sample: "Jeux d'exemple",
  anonymized: "Copie anonymisée",
  real: "Réelles",
} as const;
export const DEPLOYMENT_LABELS = {
  merge: "À chaque fusion sur main",
  version: "Sur validation d'une version",
  manual: "Manuel",
} as const;

export const INTEGRATION_PILLS: Record<
  TechnicalEnvironments["integrations"][number]["status"],
  { label: string; tone: PillTone }
> = {
  to_choose: { label: "À trancher", tone: "warning" },
  account_to_create: { label: "Compte à créer", tone: "soft" },
  configured: { label: "Configuré", tone: "success" },
  connected: { label: "Connecté", tone: "success" },
};

type Environment = TechnicalEnvironments["environments"][number];

const FIXED_ROWS: ReadonlyArray<{
  label: string;
  mono?: boolean;
  value: (environment: Environment) => string | undefined;
}> = [
  { label: "Adresse", mono: true, value: (e) => e.address },
  { label: "Hébergement", value: (e) => e.hosting },
  { label: "Base", value: (e) => e.database },
  { label: "Données", value: (e) => DATA_LABELS[e.data] },
  { label: "Déploiement", value: (e) => e.deployment && DEPLOYMENT_LABELS[e.deployment] },
];

/** Lignes du tableau (maquette 14 l.676) : les cinq rubriques, les lignes libres, puis l'accès. */
export function environmentRowsOf(environments: readonly Environment[]) {
  const extras = [...new Set(environments.flatMap((e) => e.extras.map((extra) => extra.label)))];
  return [
    ...FIXED_ROWS.map(({ label, mono, value }) => ({
      label,
      mono: mono ?? false,
      values: environments.map(value),
    })),
    ...extras.map((label) => ({
      label,
      mono: false,
      values: environments.map((e) => e.extras.find((extra) => extra.label === label)?.value),
    })),
    { label: "Accès", mono: false, values: environments.map((e) => e.access) },
  ];
}

type StaleChange = NonNullable<SpecDeliverable["staleTechnical"]>["changes"][number];

const CHANGE_WORDS = {
  added: "ajouté",
  removed: "retiré",
  changed: "modifié",
  accepted: "accepté",
} as const;

/** « Composant C-avis ajouté, ADR-006 acceptée. » (maquette 14 l.125) : l'accord suit la nature de l'élément. */
export function staleChangesText(changes: readonly StaleChange[]): string {
  const parts = changes.map(({ id, change }) => {
    const decision = id.startsWith("ADR-");
    return `${decision ? "" : "Composant "}${id} ${CHANGE_WORDS[change]}${decision ? "e" : ""}`;
  });
  return parts.length > 0 ? `${parts.join(", ")}.` : "";
}

export const STALE_LEAD = "L'architecture a changé depuis la validation";
/** Agent fermé tant que l'architecture n'est pas revalidée (B745). */
export const STALE_CLOSED_TEXT = "Revalidez l'architecture pour relancer l'agent.";

export const DOC_ACTIONS = [
  {
    icon: "edit_note",
    label: "Rédiger les sections à rédiger",
    mode: "complete",
    instruction: "Rédiger les sections à rédiger du cahier technique",
  },
  {
    icon: "fact_check",
    label: "Vérifier la cohérence avec la stack et les exigences",
    mode: "complete",
    instruction: "Vérifier la cohérence du document avec la stack et les exigences",
  },
  {
    icon: "summarize",
    label: "Résumer pour le client",
    mode: "complete",
    instruction: "Résumer le document en langage simple pour le client",
  },
] as const;

// --- Vue client (maquette 14 l.131-136, l.800) ---
export const CLIENT_STATUS = "Validé par l'équipe";
export const CLIENT_LEAD = "Lecture seule.";
const READONLY_BASE =
  "Le cahier technique décrit les outils, l'hébergement et les garanties du produit (rapidité, sécurité, données personnelles). Il est validé par l'équipe ;";
export const CLIENT_COMMENT_TEXT = `${READONLY_BASE} vous pouvez le lire et poser vos questions en commentaire.`;
export const CLIENT_PLAIN_TEXT = `${READONLY_BASE} vous pouvez le lire.`;
export const CLIENT_NOT_VALIDATED_TITLE =
  "Le cahier technique est en cours de validation par l'équipe";
export const CLIENT_NOT_VALIDATED_TEXT =
  "Il apparaîtra ici, en lecture seule, dès que l'équipe l'aura validé.";
export const CLIENT_ERROR_TEXT = "Le cahier technique n'a pas pu être lu. Réessayez.";
export const CLIENT_QUESTION_HELP = "Une question sur cette section ? L'équipe vous répond ici.";

const plural = (count: number, one: string, other: string): string =>
  `${formatCount(count)} ${count >= 2 ? other : one}`;

export interface TechnicalCounts {
  choices: number;
  operations: number;
  requirements: number;
  environments: number;
}

/** « 24 choix · 132 opérations · 28 exigences · 3 environnements » (maquette 14 l.775). */
export const countsText = (counts: TechnicalCounts): string =>
  [
    `${formatCount(counts.choices)} choix`,
    plural(counts.operations, "opération", "opérations"),
    plural(counts.requirements, "exigence", "exigences"),
    plural(counts.environments, "environnement", "environnements"),
  ].join(" · ");

export const clientSummaryOf = (counts: TechnicalCounts): string =>
  `${countsText(counts)} · lecture seule`;

const COMMENT_NOUNS = {
  stack: "le choix",
  tech_section: "la section",
  operation: "l'opération",
} as const;
/** Cibles uniques du livrable : pas de nom à citer. */
const COMMENT_TITLES = {
  environments: "Commenter les environnements",
  requirements: "Commenter les exigences",
} as const;

export type TechnicalCommentKind = keyof typeof COMMENT_NOUNS | keyof typeof COMMENT_TITLES;

export const commentTitleFor = (kind: TechnicalCommentKind, name: string): string =>
  kind === "environments" || kind === "requirements"
    ? COMMENT_TITLES[kind]
    : `Commenter ${COMMENT_NOUNS[kind]} « ${name} »`;
