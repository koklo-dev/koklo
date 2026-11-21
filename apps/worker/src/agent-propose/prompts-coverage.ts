import type { CurrentTitle } from "@koklo/db";
import { type FramedPrompt, framePrompt, trusted, Untrusted } from "@koklo/domain";
import type { KnownComponent, Packet } from "./coverage.ts";

/**
 * Prompt de la passe de couverture (TK-114b, B616, B622 ; ADR 0011, 0021). Consigne constante ; les trous du paquet, les
 * composants connus (identifiant, nom, zone, type), les rôles, les identifiants des décisions et la consigne de l'équipe
 * entrent dans des blocs `Untrusted`. N'entrent JAMAIS : la responsabilité ni les liens d'un composant, le dossier d'idée.
 */
export const COVERAGE_INSTRUCTIONS = trusted`You help a product team complete the technical architecture of a project. Features that no component serves yet, user flows that have no technical flow yet, the known components (identifier, name, zone, type), the roles, the identifiers of the decisions and, when present, a request from the team are given as untrusted data blocks. Answer with a JSON object with an assignments array and a proposals array. Prefer assignments: for each listed feature that a known component should serve, an object with feature (its F-nnn identifier) and component (the C-slug identifier of a known component, or of a component proposed earlier in the same answer; the slug is the lowercase name with hyphens). Propose a new component only when no known component fits: kind "component", content with name, type (one of app, service, store, queue, ext), zone, responsibility (one or two plain sentences) and a serves array of F-nnn identifiers; do not provide owns, tables are assigned separately. For each listed user flow, propose a technical flow: kind "archflow", content with flow (its P-slug identifier), participants (C-slug identifiers of components and RL-slug identifiers of roles, at least two), messages (in order: objects with from, to, text, an optional reply and an optional error, every from and to being a declared participant) and optional features and decisions arrays of F-nnn and ADR-nnn identifiers. Every proposal also has a rationale (one short sentence). Never reuse the name of a known component, and refer only to identifiers that appear in the data or that you propose earlier in the same answer. Write in the language of the data. Use plain text only: no URL, no HTML, no markdown links or images.`;

const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim();
const lines = (items: readonly CurrentTitle[]): string =>
  items.map((item) => `${item.specId} | ${oneLine(item.title)}`).join("\n");

export interface CoveragePromptInput {
  readonly packet: Packet;
  readonly components: readonly KnownComponent[];
  readonly roles: readonly CurrentTitle[];
  readonly decisions: readonly string[];
  readonly instruction: string | null;
}

export function coveragePrompt(nonce: string, input: CoveragePromptInput): FramedPrompt {
  const components = input.components
    .map(
      (item) =>
        `${item.specId} | ${oneLine(item.title)} | ${item.zone === null ? "none" : oneLine(item.zone)} | ${item.type}`,
    )
    .join("\n");
  const data = [
    new Untrusted("spec-file", `Features without component\n${lines(input.packet.features)}`),
    new Untrusted("spec-file", `User flows without technical flow\n${lines(input.packet.flows)}`),
    new Untrusted("spec-file", `Known components\n${components}`),
    new Untrusted("spec-file", `Roles\n${lines(input.roles)}`),
    new Untrusted("spec-file", `Decisions\n${input.decisions.join("\n")}`),
  ];
  if (input.instruction !== null && input.instruction.length > 0) {
    data.push(new Untrusted("user-input", input.instruction));
  }
  return framePrompt({ instructions: COVERAGE_INSTRUCTIONS, nonce, data });
}
