import type { CurrentArchitecture } from "@koklo/db";
import {
  type AgentProposalKind,
  type FramedPrompt,
  framePrompt,
  trusted,
  Untrusted,
} from "@koklo/domain";
import type { LaunchSources } from "./sources.ts";

/**
 * Prompts du livrable Architecture (TK-111, B512, ADR 0011, 0021). Les consignes sont des constantes ; le Fonctionnel indexé, les
 * tables, l'architecture actuelle (sections du document comprises, TK-114e), les exigences connues, la consigne de l'utilisateur et la zone entrent dans des blocs
 * `Untrusted`. N'entrent JAMAIS : le dossier d'idée, la synthèse, les commentaires, l'identité, les lignes des jeux.
 */
const ARCHITECTURE_ZONES_INSTRUCTIONS = trusted`You help a product team design the technical architecture of a project. The functional specification (features, business rules, roles and user flows), the data model, the current architecture (components, technical flows, decisions), the known non-functional requirements and, when present, a request from the team are given as untrusted data blocks. List the zones (areas of the architecture, for example the core, the interfaces, the data stores, the external services) that the architecture should cover, as a JSON object with a zones array of short plain titles of at most 120 characters, at most 12, most important first. Write in the language of the data. Use plain text only: no URL, no HTML, no markdown links or images.`;

const COMPLETE_INSTRUCTIONS = trusted`You help a product team design the technical architecture of a project. The functional specification (features, business rules, roles and user flows), the data model (tables with their zone and field names), the current architecture (components, technical flows, decisions), the known non-functional requirements, the zone to work on and, when present, a request from the team are given as untrusted data blocks. Propose, for that zone, at most 25 proposals in total as a JSON object with a proposals array, among: Components: kind "component", content with name, type (one of app, service, store, queue, ext; ext is an external service that owns no table), zone, responsibility (one or two plain sentences), an optional owns array of T-slug identifiers of the tables the component owns (a table has one owner), an optional serves array of F-nnn identifiers of the features it serves, an optional dependsOn array of objects with to (the C-slug identifier of another component: the slug is the lowercase name with hyphens, for example C-api for API), via (the channel, such as HTTP, SQL or AMQP) and async (true for an asynchronous call such as a queue or an event; synchronous calls must never form a cycle), an optional decisions array of ADR-nnn identifiers and an optional clientSummary array of at most 12 plain sentences of at most 200 characters that tell the client in everyday words what the component does, with no technical identifier and no jargon. Technical flows: kind "archflow", content with flow (the P-slug identifier of an existing business flow that has no technical flow yet), participants (C-slug identifiers of components and RL-slug identifiers of roles, at least two), messages (in order: objects with from, to, text, an optional reply and an optional error, every from and to being a declared participant; an alternative is an object with block "alt", a label and a messages array; a divider is an object with block "separator" and a label), and optional features, rules and decisions arrays of F-nnn, R-nnn and ADR-nnn identifiers. Every proposal also has a rationale (one short sentence). Never reuse the name of an existing component or the title of an existing decision, and refer only to identifiers that appear in the data or that you propose earlier in the same list. Write in the language of the data. Use plain text only: no URL, no HTML, no markdown links or images.`;

const DECISION_INSTRUCTIONS = trusted`You help a product team design the technical architecture of a project. The functional specification (features, business rules, roles and user flows), the data model (tables with their zone and field names), the current architecture (components, technical flows, decisions), the known non-functional requirements, the zone to work on and, when present, a request from the team are given as untrusted data blocks. Propose, for that zone, at most 25 proposals in total as a JSON object with a proposals array, among: Decisions: kind "adr", content with title, context (why a choice is needed), decision (what is chosen), an optional positives array and an optional accepted array of short consequences (the benefits, and what the team accepts), an alternatives array of 1 to 6 objects with name and reason (why it was not chosen), an optional plain text (at most 1000 characters) explaining the decision in everyday words for the client, and an optional links array of F-nnn, R-nnn, T-slug, C-slug or P-slug identifiers. Every proposal also has a rationale (one short sentence). Never reuse the name of an existing component or the title of an existing decision, and refer only to identifiers that appear in the data or that you propose earlier in the same list. Write in the language of the data. Use plain text only: no URL, no HTML, no markdown links or images.`;

const DOCUMENT_INSTRUCTIONS = trusted`You help a product team design the technical architecture of a project. The functional specification (features, business rules, roles and user flows), the data model (tables with their zone and field names), the current architecture (components, technical flows, decisions), the known non-functional requirements, the zone to work on and, when present, a request from the team are given as untrusted data blocks. Propose, for that zone, at most 25 proposals in total as a JSON object with a proposals array, among: Document sections: kind "doc_section", content with title and markdown (the text of one section of the architecture document, plain markdown without links or images). Every proposal also has a rationale (one short sentence). Never reuse the name of an existing component or the title of an existing decision or document section, and refer only to identifiers that appear in the data or that you propose earlier in the same list. Write in the language of the data. Use plain text only: no URL, no HTML, no markdown links or images.`;

const ALL_INSTRUCTIONS = trusted`You help a product team design the technical architecture of a project. The functional specification (features, business rules, roles and user flows), the data model (tables with their zone and field names), the current architecture (components, technical flows, decisions), the known non-functional requirements, the zone to work on and, when present, a request from the team are given as untrusted data blocks. Propose, for that zone, at most 25 proposals in total as a JSON object with a proposals array, among: Components: kind "component", content with name, type (one of app, service, store, queue, ext; ext is an external service that owns no table), zone, responsibility (one or two plain sentences), an optional owns array of T-slug identifiers of the tables the component owns (a table has one owner), an optional serves array of F-nnn identifiers of the features it serves, an optional dependsOn array of objects with to (the C-slug identifier of another component: the slug is the lowercase name with hyphens, for example C-api for API), via (the channel, such as HTTP, SQL or AMQP) and async (true for an asynchronous call such as a queue or an event; synchronous calls must never form a cycle), an optional decisions array of ADR-nnn identifiers and an optional clientSummary array of at most 12 plain sentences of at most 200 characters that tell the client in everyday words what the component does, with no technical identifier and no jargon. Technical flows: kind "archflow", content with flow (the P-slug identifier of an existing business flow that has no technical flow yet), participants (C-slug identifiers of components and RL-slug identifiers of roles, at least two), messages (in order: objects with from, to, text, an optional reply and an optional error, every from and to being a declared participant; an alternative is an object with block "alt", a label and a messages array; a divider is an object with block "separator" and a label), and optional features, rules and decisions arrays of F-nnn, R-nnn and ADR-nnn identifiers. Decisions: kind "adr", content with title, context (why a choice is needed), decision (what is chosen), an optional positives array and an optional accepted array of short consequences (the benefits, and what the team accepts), an alternatives array of 1 to 6 objects with name and reason (why it was not chosen), an optional plain text (at most 1000 characters) explaining the decision in everyday words for the client, and an optional links array of F-nnn, R-nnn, T-slug, C-slug or P-slug identifiers. Document sections: kind "doc_section", content with title and markdown (the text of one section of the architecture document, plain markdown without links or images). Every proposal also has a rationale (one short sentence). Never reuse the name of an existing component or the title of an existing decision or document section, and refer only to identifiers that appear in the data or that you propose earlier in the same list. Write in the language of the data. Use plain text only: no URL, no HTML, no markdown links or images.`;

/** Consigne constante du mode (`trusted` n'admet aucune interpolation) : jamais de texte venu des données. */
function architectureInstructions(kinds: readonly AgentProposalKind[]) {
  if (kinds.length > 2) return ALL_INSTRUCTIONS;
  if (kinds.includes("adr")) return DECISION_INSTRUCTIONS;
  if (kinds.includes("doc_section")) return DOCUMENT_INSTRUCTIONS;
  return COMPLETE_INSTRUCTIONS;
}

const LINES_MAX = 300;
const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim();
const lines = (items: readonly { specId: string; title: string }[]): string =>
  items
    .slice(0, LINES_MAX)
    .map((item) => `${item.specId} | ${oneLine(item.title)}`)
    .join("\n");

/** Composants : identifiant, nom, zone et type, un par ligne. */
export const componentLines = (components: CurrentArchitecture["components"]): string =>
  components
    .map(
      (item) =>
        `${item.specId} | ${oneLine(item.title)} | zone: ${item.zone ?? "none"} | type: ${item.type}`,
    )
    .join("\n");

/** Décisions et exigences non fonctionnelles connues. */
export const knownLines = (architecture: CurrentArchitecture | undefined): string[] => [
  `Decisions\n${lines(architecture?.decisions ?? [])}`,
  `Known non-functional requirements\n${(architecture?.nfr ?? []).join("\n")}`,
];

export const functionalBlock = (sources: LaunchSources): Untrusted =>
  new Untrusted(
    "spec-file",
    [
      `Functional specification\nFeatures\n${lines(sources.features)}`,
      `Business rules\n${lines(sources.rules)}`,
      `Roles\n${lines(sources.roles)}`,
      `User flows\n${lines(sources.flows)}`,
    ].join("\n\n"),
  );

export const dataModelBlock = (sources: LaunchSources): Untrusted =>
  new Untrusted(
    "spec-file",
    `Data model\n${(sources.tables ?? [])
      .map(
        (table) =>
          `${table.specId} | ${oneLine(table.title)} | zone: ${table.zone ?? "none"} | fields: ${table.fields.join(", ")}`,
      )
      .join("\n")}`,
  );

/** Fonctionnel, tables, architecture actuelle, exigences connues et sections du document : aussi lus par le Technique. */
export function architectureBlocks(sources: LaunchSources): Untrusted[] {
  const architecture = sources.architecture;
  return [
    functionalBlock(sources),
    dataModelBlock(sources),
    new Untrusted(
      "spec-file",
      [
        `Current architecture\nComponents\n${componentLines(architecture?.components ?? [])}`,
        `Technical flows\n${lines(architecture?.archflows ?? [])}`,
        ...knownLines(architecture),
        `Document sections\n${lines(sources.docSections ?? [])}`,
      ].join("\n\n"),
    ),
  ];
}

export const withInstruction = (blocks: Untrusted[], instruction: string | null): Untrusted[] =>
  instruction === null || instruction.length === 0
    ? blocks
    : [...blocks, new Untrusted("user-input", instruction)];

export function architectureZonesPrompt(
  nonce: string,
  sources: LaunchSources,
  instruction: string | null,
): FramedPrompt {
  return framePrompt({
    instructions: ARCHITECTURE_ZONES_INSTRUCTIONS,
    nonce,
    data: withInstruction(architectureBlocks(sources), instruction),
  });
}

export function architectureBatchPrompt(
  nonce: string,
  input: {
    sources: LaunchSources;
    instruction: string | null;
    zone: string;
    kinds: readonly AgentProposalKind[];
  },
): FramedPrompt {
  return framePrompt({
    instructions: architectureInstructions(input.kinds),
    nonce,
    data: [
      ...withInstruction(architectureBlocks(input.sources), input.instruction),
      new Untrusted("model-output", `Zone: ${input.zone}`),
    ],
  });
}
