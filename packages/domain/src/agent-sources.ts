import { Untrusted } from "./untrusted.ts";

/**
 * Sources que l'agent lit pour le Fonctionnel (forme de `@koklo/db` `dossier-sources`, sans dépendance) et blocs de
 * données non fiables qui en sont tirés : la même mise en forme et les mêmes troncatures (B316 f) pour le job
 * `agent-propose` et pour `ai.proposeFeatures`. N'entrent JAMAIS : identité, clé, commentaires, autres projets, brouillons.
 */
export interface AgentSources {
  readonly tag: string;
  /** Mode `update` : la version précédente et les pages retirées ; `pages` ne porte alors que les pages ajoutées ou modifiées. */
  readonly diff?: { readonly from: string; readonly removed: readonly string[] };
  readonly pages: readonly { readonly title: string; readonly content: string }[];
  readonly synthesis: string | null;
  readonly risks: string | null;
  readonly features: readonly {
    readonly specId: string;
    readonly title: string;
    readonly criteria: readonly string[];
  }[];
}

/** Plafonds de lecture : la somme reste sous le budget de prompt (`PROPOSAL_BUDGETS`). */
const PAGE_CHARS = 6_000;
const PAGES_CHARS = 24_000;
const SYNTHESIS_CHARS = 8_000;
const RISKS_CHARS = 6_000;
const CURRENT_CHARS = 12_000;

const clip = (text: string, max: number): string => (text.length > max ? text.slice(0, max) : text);
const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim();

const pagesText = (sources: AgentSources): string =>
  clip(
    sources.pages
      .map((page) => `## ${oneLine(page.title)}\n${clip(page.content, PAGE_CHARS)}`)
      .join("\n\n"),
    PAGES_CHARS,
  );

/** `F-nnn | titre` puis les titres de critères, ou « no criteria » : jamais d'identité ni de statut. */
const currentText = (sources: AgentSources): string =>
  clip(
    sources.features
      .map((feature) =>
        [
          `${feature.specId} | ${oneLine(feature.title)}`,
          ...(feature.criteria.length === 0
            ? ["  no criteria"]
            : feature.criteria.map((title) => `  - ${oneLine(title)}`)),
        ].join("\n"),
      )
      .join("\n"),
    CURRENT_CHARS,
  );

/** Le dossier figé, ou en mode `update` les seuls changements entre les deux versions (pages inchangées jamais fournies). */
function dossierText(sources: AgentSources): string {
  if (sources.diff === undefined) return `Frozen dossier (${sources.tag})\n${pagesText(sources)}`;
  const removed =
    sources.diff.removed.length > 0 ? `\nRemoved pages: ${sources.diff.removed.join(", ")}` : "";
  return `Changes from ${sources.diff.from} to ${sources.tag}\n${pagesText(sources)}${removed}`;
}

/** Blocs de données : seules les sources de « L'agent lit » et, quand elle existe, la consigne de l'utilisateur. */
export function sourceBlocks(sources: AgentSources, instruction: string | null): Untrusted[] {
  const blocks = [new Untrusted("spec-file", dossierText(sources))];
  if (sources.synthesis !== null) {
    blocks.push(
      new Untrusted("spec-file", `Synthesis\n${clip(sources.synthesis, SYNTHESIS_CHARS)}`),
    );
  }
  if (sources.risks !== null) {
    blocks.push(
      new Untrusted("spec-file", `Assumptions and risks\n${clip(sources.risks, RISKS_CHARS)}`),
    );
  }
  blocks.push(new Untrusted("spec-file", `Current specification\n${currentText(sources)}`));
  if (instruction !== null && instruction.length > 0) {
    blocks.push(new Untrusted("user-input", instruction));
  }
  return blocks;
}
