import type { SpecBatchSubmitInput } from "@koklo/contract";
import type { ProposalOutput } from "./proposal-types.ts";

type Operation = SpecBatchSubmitInput["operations"][number];
type Content = Record<string, unknown>;

/**
 * Propositions du cahier technique (TK-115) : `stack`, `op`, `nfr`, `env` et les sections de son document. Les champs
 * suivent ceux des opérations du contrat ; `specId` (posé par le worker seul) fait d'une proposition une mise à jour.
 */
const FIELDS = {
  stack: [
    "role",
    "layer",
    "icon",
    "components",
    "status",
    "choice",
    "recommended",
    "options",
    "criteria",
    "why",
    "plain",
    "requirements",
    "decisions",
  ],
  op: [
    "type",
    "zone",
    "component",
    "summary",
    "permission",
    "input",
    "output",
    "errors",
    "rules",
    "features",
    "rateLimit",
  ],
  nfr: ["category", "title", "target", "statement", "verification", "verificationDetail", "links"],
  env: [
    "name",
    "address",
    "hosting",
    "database",
    "data",
    "deployment",
    "access",
    "extras",
    "variables",
    "integrations",
  ],
} as const;
type Kind = keyof typeof FIELDS;

const str = (value: unknown): string => (typeof value === "string" ? value : "");
const OPEN_CHOICE = "À trancher";

/** Section du document technique : la liste des propositions ne dit pas son livrable, l'écran le marque. */
export const asTechnical = (proposal: ProposalOutput): ProposalOutput =>
  proposal.kind === "doc_section"
    ? { ...proposal, content: { ...proposal.content, deliverable: "technical" } }
    : proposal;

export const isTechnicalDocument = ({ kind, content }: ProposalOutput): boolean =>
  kind === "doc_section" && content.deliverable === "technical";

export const isTechnicalKind = (kind: string): kind is Kind => Object.hasOwn(FIELDS, kind);

/** Proposition du cahier technique : ses quatre types, ou une section de son document. */
export const isTechnicalProposal = (proposal: ProposalOutput): boolean =>
  isTechnicalKind(proposal.kind) || isTechnicalDocument(proposal);

/** Champs présents et non vides de la charge (le contrat refuse certaines listes vides). */
const pick = (content: Content, fields: readonly string[]): Content =>
  Object.fromEntries(
    fields.flatMap((field) => {
      const value = content[field];
      const empty = value === undefined || (Array.isArray(value) && value.length === 0);
      return empty ? [] : [[field, value]];
    }),
  );

function docOperation({ content }: ProposalOutput): Operation {
  const specId = str(content.specId);
  return {
    kind: specId ? "doc.section.update" : "doc.section.create",
    ...(specId ? { specId } : {}),
    deliverable: "technical",
    title: str(content.title).trim(),
    markdown: str(content.markdown).trim(),
    status: "a_relire",
  } as Operation;
}

/** Opération d'une proposition acceptée du cahier technique (une seule par proposition). */
export function technicalOperationOf(proposal: ProposalOutput): Operation | null {
  if (isTechnicalDocument(proposal)) return docOperation(proposal);
  const { kind, content } = proposal;
  if (!isTechnicalKind(kind)) return null;
  const specId = str(content.specId);
  const fields = pick(content, FIELDS[kind]);
  if (specId) return { kind: `${kind}.update`, specId, ...fields } as unknown as Operation;
  const name = kind === "op" ? { name: str(content.name) } : {};
  return { kind: `${kind}.create`, ...name, ...fields } as unknown as Operation;
}

const slugOf = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const RANK_WIDTH = 3;

const REFS: Record<Kind, (proposal: ProposalOutput) => string> = {
  stack: ({ content }) => `ST-${slugOf(str(content.role)) || "choix"}`,
  op: ({ content }) => str(content.name),
  nfr: ({ position }) => `NFR-${String(position + 1).padStart(RANK_WIDTH, "0")}`,
  env: ({ content }) => `ENV-${slugOf(str(content.name)) || "environnement"}`,
};

/**
 * Titre lu en relecture d'un choix : « rôle : option retenue » ou « rôle : À trancher » (maquette 14 l.736). Le titre
 * du serveur reste le seul rôle : c'est sa clé de dédoublonnage.
 */
export function technicalTitleOf({ kind, title, content }: ProposalOutput): string {
  if (kind !== "stack") return title;
  const choice = content.status === "chosen" ? str(content.choice) : "";
  return `${str(content.role) || title} : ${choice || OPEN_CHOICE}`;
}

/** Ligne sous le titre : le « pourquoi » d'un choix (maquette 14 l.154, 736), sinon la justification de l'agent. */
export function technicalWhyOf({ kind, rationale, content }: ProposalOutput): string {
  return (kind === "stack" && str(content.why)) || rationale;
}

/** Identifiant lisible : celui de l'élément mis à jour, sinon celui que le serveur donnera. */
export function technicalRefOf(proposal: ProposalOutput): string {
  const specId = str(proposal.content.specId);
  if (specId) return specId;
  const { kind } = proposal;
  if (isTechnicalKind(kind)) return REFS[kind](proposal);
  return `DOC-${slugOf(str(proposal.content.title)) || "section"}`;
}

export const OPERATION_TYPE_LABELS: Record<string, string> = {
  read: "lecture",
  write: "écriture",
  internal: "interne",
};

const SUBTITLES: Record<Kind, (content: Content) => string> = {
  stack: (c) => `Choix · ${c.status === "open" ? "à trancher" : "choisi"}`,
  op: (c) => `${OPERATION_TYPE_LABELS[str(c.type)] ?? "opération"} · zone ${str(c.zone)}`,
  nfr: (c) => `Exigence · ${str(c.target)}`,
  env: () => "Environnement",
};

/** Ligne secondaire de la liste (maquette 14 l.737-741). */
export function technicalSubtitleOf(proposal: ProposalOutput): string {
  const { kind } = proposal;
  if (isTechnicalKind(kind)) return SUBTITLES[kind](proposal.content);
  return "Section · cahier-technique.md";
}
