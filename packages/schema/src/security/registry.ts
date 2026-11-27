import type {
  DataCategory,
  DataEntry,
  EnvironmentsFile,
  SecurityData,
  Stack,
} from "../entities/index.ts";
import { isPersonalData } from "./blockers.ts";
import { RETENTION_UNDECIDED } from "./summary.ts";
import { oneLineOf } from "./text.ts";

/**
 * Registre des traitements en Markdown (TK-117, B809) et contexte d'hébergement tiré du cahier technique (B800). Rien
 * d'inventé : aucune base légale, « À préciser » pour ce que la spec ne dit pas. Tout texte est échappé. Fonctions pures.
 */
const UNKNOWN = "À préciser";
const CELL_MAX = 2000;

export interface SecurityContext {
  readonly hosting: readonly string[];
  readonly subprocessors: readonly string[];
  readonly transfers: string | undefined;
}

export interface SecurityContextFacts {
  readonly environments?: Pick<EnvironmentsFile, "environnements"> | undefined;
  readonly stacks?: readonly Pick<Stack, "couche" | "statut" | "choix" | "role">[];
  readonly data?: Pick<SecurityData, "transferts"> | undefined;
}

/** Hébergeurs des environnements, services externes retenus et transferts déclarés. */
export function securityContext(facts: SecurityContextFacts): SecurityContext {
  const hosting = facts.environments?.environnements.map((entry) => entry.hebergement) ?? [];
  const subprocessors = (facts.stacks ?? []).flatMap((stack) =>
    stack.couche === "externes" && stack.statut === "choisi" && stack.choix !== undefined
      ? [`${stack.choix} (${stack.role})`]
      : [],
  );
  return {
    hosting: [...new Set(hosting)],
    subprocessors: [...new Set(subprocessors)],
    transfers: facts.data?.transferts,
  };
}

/** Texte rendu inerte : une ligne, sans balise, lien, mise en forme ni séparateur de cellule. */
const escaped = (text: string): string =>
  oneLineOf(text, CELL_MAX)
    .replace(/&/g, "&amp;")
    .replace(/[\\`*_[\]|#]/g, "\\$&")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const listed = (values: readonly string[], separator = ", "): string =>
  values.length === 0 ? UNKNOWN : values.map(escaped).join(separator);

const CATEGORY_LABELS: Readonly<Record<DataCategory, string>> = {
  personnelle: "Personnelle",
  contact: "Contact",
  sensible: "Santé ou sensible",
  secret: "Secret",
  technique: "Technique",
};
const COLUMNS = ["Donnée", "Champs", "Catégorie", "Conservation", "Accès", "Protection"];

const row = (cells: readonly string[]): string => `| ${cells.join(" | ")} |`;

const entryRow = (entry: DataEntry): string =>
  row([
    escaped(entry.donnee),
    listed(entry.champs),
    CATEGORY_LABELS[entry.categorie],
    escaped(entry.conservation ?? RETENTION_UNDECIDED),
    listed(entry.acces),
    escaped(entry.protection ?? UNKNOWN),
  ]);

function dataTable(entries: readonly DataEntry[]): string[] {
  const personal = entries.filter((entry) => isPersonalData(entry.categorie));
  if (personal.length === 0) return ["Aucune donnée personnelle classée."];
  return [row(COLUMNS), row(COLUMNS.map(() => "---")), ...personal.map(entryRow)];
}

const slug = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 60)
    .replace(/^-+|-+$/g, "");

export interface RegistryInput {
  readonly projectName: string;
  readonly projectSlug: string;
  readonly data: Pick<SecurityData, "donnees"> | undefined;
  readonly context: SecurityContext;
}

export function rgpdRegistry({ projectName, projectSlug, data, context }: RegistryInput): {
  filename: string;
  markdown: string;
} {
  const lines = [
    `# Registre des traitements · ${escaped(projectName)}`,
    "",
    "Document de travail généré depuis la spec du projet, à faire relire par un juriste.",
    "",
    "## Données personnelles",
    "",
    ...dataTable(data?.donnees ?? []),
    "",
    "## Hébergement et sous-traitants",
    "",
    `- Hébergement : ${listed(context.hosting)}`,
    `- Sous-traitants : ${listed(context.subprocessors)}`,
    `- Transferts hors de l'Union européenne : ${escaped(context.transfers ?? UNKNOWN)}`,
  ];
  return {
    filename: `registre-rgpd-${slug(projectSlug) || "projet"}.md`,
    markdown: `${lines.join("\n")}\n`,
  };
}
