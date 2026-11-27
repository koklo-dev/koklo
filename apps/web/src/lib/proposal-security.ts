import type { SpecBatchSubmitInput } from "@koklo/contract";
import { DATA_CATEGORY_PILL, type DataCategoryKind } from "@koklo/ui";
import type { ProposalOutput } from "./proposal-types.ts";
import { CHAPTER_LABELS, SEVERITY_LABELS } from "./security-labels.ts";

type Operation = SpecBatchSubmitInput["operations"][number];
type Content = Record<string, unknown>;

/**
 * Propositions de la Sécurité (TK-117, B806) : `threat`, `sensitive`, `right`, `asvs`, `summary` et les sections de son
 * dossier. Une conservation proposée ne part jamais dans un lot (A7) : seule la suggestion est gardée.
 */
const FIELDS = {
  threat: [
    "title",
    "surfaces",
    "category",
    "severity",
    "risk",
    "measures",
    "verification",
    "verificationDetail",
    "scenario",
    "links",
  ],
  sensitive: ["data", "fields", "category", "access", "protection", "retentionSuggestion"],
  right: ["role", "permission", "restriction", "ownershipRule"],
  summary: ["location", "protection", "access", "signIn", "checks", "incident"],
} as const;
const REQUIREMENT = ["chapter", "title", "level", "answer", "links"] as const;
const KINDS: ReadonlySet<string> = new Set([...Object.keys(FIELDS), "asvs"]);

const str = (value: unknown): string => (typeof value === "string" ? value : "");
const record = (value: unknown): Content | undefined =>
  typeof value === "object" && value !== null ? (value as Content) : undefined;
const first = (value: unknown): string => str(Array.isArray(value) ? value[0] : undefined);

/** Section du dossier : la liste des propositions ne dit pas son livrable, l'écran le marque. */
export const asSecurity = (proposal: ProposalOutput): ProposalOutput =>
  proposal.kind === "doc_section"
    ? { ...proposal, content: { ...proposal.content, deliverable: "security" } }
    : proposal;

export const isSecurityDocument = ({ kind, content }: ProposalOutput): boolean =>
  kind === "doc_section" && content.deliverable === "security";

export const isSecurityProposal = (proposal: ProposalOutput): boolean =>
  KINDS.has(proposal.kind) || isSecurityDocument(proposal);

/** Champs présents et non vides de la charge. */
const pick = (content: Content, fields: readonly string[]): Content =>
  Object.fromEntries(
    fields.flatMap((field) => {
      const value = content[field];
      const empty = value === undefined || (Array.isArray(value) && value.length === 0);
      return empty ? [] : [[field, value]];
    }),
  );

const operation = (kind: string, fields: Content): Operation =>
  ({ kind, ...fields }) as unknown as Operation;

function docOperation({ content }: ProposalOutput): Operation {
  const specId = str(content.specId);
  return operation(specId ? "doc.section.update" : "doc.section.create", {
    ...(specId ? { specId } : {}),
    deliverable: "security",
    title: str(content.title).trim(),
    markdown: str(content.markdown).trim(),
    status: "a_relire",
  });
}

/** Une exigence (mise à jour par son identifiant, posé par le code), ou les faits « Secrets et dépendances ». */
function asvsOperation(content: Content): Operation {
  const requirement = record(content.requirement);
  if (!requirement) return operation("asvs.update", { facts: content.facts });
  const fields = pick(requirement, REQUIREMENT);
  const id = str(requirement.specId);
  return id
    ? operation("asvs.update", { requirementId: id, ...fields })
    : operation("asvs.create", fields);
}

/** Opération d'une proposition acceptée de la Sécurité (une seule par proposition). */
export function securityOperationOf(proposal: ProposalOutput): Operation | null {
  if (isSecurityDocument(proposal)) return docOperation(proposal);
  const { kind, content } = proposal;
  if (kind === "asvs") return asvsOperation(content);
  if (!Object.hasOwn(FIELDS, kind)) return null;
  const fields = pick(content, FIELDS[kind as keyof typeof FIELDS]);
  if (kind === "summary") return operation("summary.update", fields);
  if (kind === "right") return operation("right.create", fields);
  const specId = str(content.specId);
  return specId
    ? operation(`${kind}.update`, { specId, ...fields })
    : operation(`${kind}.create`, fields);
}

const slugOf = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const REFS: Record<string, (content: Content) => string> = {
  threat: (c) => str(c.specId) || "SEC-nouvelle",
  sensitive: (c) => str(c.specId) || first(c.fields),
  right: (c) =>
    c.permission ? `DR-${slugOf(str(c.permission).replace(/^PM-/, ""))}` : "DR-propriete",
  asvs: (c) => str(record(c.requirement)?.specId) || "ASVS",
  summary: () => "Résumé",
};

export function securityRefOf(proposal: ProposalOutput): string {
  const ref = REFS[proposal.kind];
  if (ref) return ref(proposal.content);
  return `DOC-${slugOf(str(proposal.content.title)) || "section"}`;
}

const label = <K extends string>(labels: Record<K, string>, value: unknown): string =>
  labels[str(value) as K] ?? "";

const categoryLabel = (value: unknown): string =>
  DATA_CATEGORY_PILL[str(value) as DataCategoryKind]?.label ?? "à classer";

/** Ligne secondaire de la liste (maquette 15 l.627-629). */
const SUBTITLES: Record<string, (content: Content) => string> = {
  threat: (c) =>
    `Menace · ${first(c.surfaces)} · gravité ${label(SEVERITY_LABELS, c.severity).toLowerCase()}`,
  sensitive: (c) => `Donnée · ${categoryLabel(c.category)}`,
  right: (c) => `Droit · ${str(c.permission) || "propriété"}`,
  asvs: (c) => {
    const requirement = record(c.requirement);
    return requirement
      ? `Exigence · ${label(CHAPTER_LABELS, requirement.chapter)}`
      : "Exigences · secrets et dépendances";
  },
  summary: () => "Résumé client",
};

export const securitySubtitleOf = (proposal: ProposalOutput): string =>
  SUBTITLES[proposal.kind]?.(proposal.content) ?? "Document · dossier de sécurité";
