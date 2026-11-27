import type { SpecBatchSubmitInput } from "@koklo/contract";
import { COMPONENT_UPDATE, componentTypeLabel } from "./architecture-labels.ts";
import type { ProposalOutput } from "./proposal-types.ts";

type Operation = SpecBatchSubmitInput["operations"][number];
type Content = Record<string, unknown>;

/**
 * Propositions du livrable Architecture (TK-111, B507, B508) : `component`, `archflow`, `adr`, `doc_section`. Leurs
 * champs suivent ceux des opérations `component.*`, `archflow.*`, `adr.*`, `doc.section.*` (anglais) ; le serveur pose
 * les identifiants `C-` et `ADR-`.
 */
export const ARCHITECTURE_KINDS = ["component", "archflow", "adr", "doc_section"] as const;
export const isArchitectureKind = (kind: string): boolean =>
  (ARCHITECTURE_KINDS as readonly string[]).includes(kind);

/** Zone d'un composant : 120 caractères au plus (contrat 3.9.0). */
const ZONE_MAX = 120;

const str = (value: unknown): string => (typeof value === "string" ? value : "");
const strings = (value: unknown): string[] =>
  (Array.isArray(value) ? value : []).filter((item): item is string => typeof item === "string");
const records = (value: unknown): Content[] =>
  (Array.isArray(value) ? value : []).filter(
    (item): item is Content => typeof item === "object" && item !== null,
  );

/** Champ facultatif : absent quand la liste est vide (le contrat refuse certaines listes vides). */
const optional = <T>(key: string, value: T | undefined | []): Record<string, T> =>
  value === undefined || (Array.isArray(value) && value.length === 0) ? {} : { [key]: value as T };

const slugOf = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * Identifiant indexé que la proposition met à jour, posé par le worker seul : composant `C-` (B615) ou flux repris `P-`
 * (B659) ; sinon `undefined`.
 */
const SPEC_ID: Record<string, RegExp> = {
  component: /^C-[a-z0-9][a-z0-9-]*$/,
  archflow: /^P-[a-z0-9][a-z0-9-]*$/,
};
const specIdOf = ({ kind, content }: ProposalOutput): string | undefined => {
  const specId = str(content.specId);
  return SPEC_ID[kind]?.test(specId) ? specId : undefined;
};

/** La proposition met à jour un élément indexé, elle n'en crée pas. */
export const isArchitectureUpdate = (proposal: ProposalOutput): boolean =>
  specIdOf(proposal) !== undefined;

const dependenciesOf = (content: Content) =>
  records(content.dependsOn).map((link) => ({
    to: str(link.to),
    via: str(link.via),
    ...(link.async === true ? { async: true } : {}),
  }));

function componentOperation(proposal: ProposalOutput): Operation {
  const { content } = proposal;
  const specId = specIdOf(proposal);
  const dependsOn = dependenciesOf(content);
  // Mise à jour d'un composant indexé : les liens seuls, complets (index ∪ ajouts), jamais le nom ni la responsabilité ;
  // `dependsOn` et `actors` seulement quand la charge en porte (B637, B659).
  if (specId) {
    return {
      kind: "component.update",
      specId,
      owns: strings(content.owns),
      serves: strings(content.serves),
      ...optional("actors", strings(content.actors)),
      ...optional("dependsOn", dependsOn),
    };
  }
  return {
    kind: "component.create",
    name: str(content.name).trim(),
    type: str(content.type) as "app",
    zone: (proposal.zone || str(content.zone)).trim().slice(0, ZONE_MAX),
    responsibility: str(content.responsibility).trim(),
    ...optional("owns", strings(content.owns)),
    ...optional("serves", strings(content.serves)),
    ...optional("actors", strings(content.actors)),
    ...optional("dependsOn", dependsOn),
    ...optional("decisions", strings(content.decisions)),
    ...optional("clientSummary", strings(content.clientSummary)),
  };
}

type FlowMessages = Extract<Operation, { kind: "archflow.create" }>["messages"];

/** Flux d'un parcours ; reprise d'un flux indexé (`specId` `P-`, B655, B659) : `archflow.update` des mêmes champs. */
function archflowOperation(proposal: ProposalOutput): Operation {
  const { content } = proposal;
  const fields = {
    participants: strings(content.participants),
    messages: (Array.isArray(content.messages) ? content.messages : []) as FlowMessages,
    ...optional("features", strings(content.features)),
    ...optional("rules", strings(content.rules)),
    ...optional("decisions", strings(content.decisions)),
  };
  const specId = specIdOf(proposal);
  if (specId) return { kind: "archflow.update", specId, ...fields };
  return { kind: "archflow.create", flow: str(content.flow), ...fields };
}

function adrOperation({ content }: ProposalOutput): Operation {
  const alternatives = records(content.alternatives).map((item) => ({
    name: str(item.name),
    reason: str(item.reason),
  }));
  const plain = str(content.plain).trim();
  return {
    kind: "adr.create",
    title: str(content.title).trim(),
    context: str(content.context).trim(),
    decision: str(content.decision).trim(),
    ...optional("positives", strings(content.positives)),
    ...optional("accepted", strings(content.accepted)),
    ...optional("alternatives", alternatives),
    ...optional("plain", plain || undefined),
    ...optional("links", strings(content.links)),
  };
}

/** Une section proposée par l'agent entre « À relire » : l'équipe l'a acceptée, elle la relira dans le document. */
function docSectionOperation({ content }: ProposalOutput): Operation {
  return {
    kind: "doc.section.create",
    title: str(content.title).trim(),
    markdown: str(content.markdown).trim(),
    status: "a_relire",
  };
}

/** Opération d'une proposition acceptée de l'architecture (une seule par proposition). */
export function architectureOperationOf(proposal: ProposalOutput): Operation | null {
  switch (proposal.kind) {
    case "component":
      return componentOperation(proposal);
    case "archflow":
      return archflowOperation(proposal);
    case "adr":
      return adrOperation(proposal);
    case "doc_section":
      return docSectionOperation(proposal);
    default:
      return null;
  }
}

const RANK_WIDTH = 3;

/** Identifiant lisible : `C-<slug du nom>`, `P-` du parcours, `ADR-<rang>` (le serveur numérote), `DOC-<slug du titre>`. */
export function architectureRefOf(proposal: ProposalOutput): string {
  const { content } = proposal;
  if (proposal.kind === "component") {
    return specIdOf(proposal) ?? `C-${slugOf(str(content.name)) || "composant"}`;
  }
  if (proposal.kind === "archflow") return specIdOf(proposal) ?? (str(content.flow) || "P-flux");
  if (proposal.kind === "adr") {
    return `ADR-${String(proposal.position + 1).padStart(RANK_WIDTH, "0")}`;
  }
  return `DOC-${slugOf(str(content.title)) || "section"}`;
}

const plural = (n: number, one: string, other: string): string => `${n} ${n >= 2 ? other : one}`;

/** Messages d'un flux : les blocs `alt` et `separator` ne comptent pas, les messages du `alt` si. */
const messageCount = (value: unknown): number =>
  records(value).reduce((total, item) => {
    if (item.block === "separator") return total;
    return total + (item.block === "alt" ? records(item.messages).length : 1);
  }, 0);

/** « Service · zone Prise de rendez-vous », « Flux · 3 messages », « Décision · 2 alternatives écartées ». */
export function architectureSubtitleOf(proposal: ProposalOutput): string {
  const { content } = proposal;
  if (proposal.kind === "component") {
    const zone = proposal.zone || str(content.zone);
    const kind = specIdOf(proposal) ? COMPONENT_UPDATE : componentTypeLabel(str(content.type));
    return `${kind} · zone ${zone}`;
  }
  if (proposal.kind === "archflow") {
    const label = specIdOf(proposal) ? "Flux repris" : "Flux";
    return `${label} · ${plural(messageCount(content.messages), "message", "messages")}`;
  }
  if (proposal.kind === "adr") {
    const alternatives = records(content.alternatives).length;
    return `Décision · ${plural(alternatives, "alternative écartée", "alternatives écartées")}`;
  }
  return "Section du document";
}
