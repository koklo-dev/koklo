import type { FeatureDetail } from "@koklo/contract";
import {
  type AgentSources,
  type FramedPrompt,
  framePrompt,
  sourceBlocks,
  type Trusted,
  trusted,
  Untrusted,
} from "@koklo/domain";

/**
 * Prompts des appels au modèle (CDC §15, ADR 0011). Les consignes sont des constantes écrites ici ;
 * tout ce qui vient d'un utilisateur, de l'index ou de git entre dans un bloc `Untrusted` délimité
 * par le nonce de l'appel, jamais dans la consigne. N'entrent JAMAIS : clé, identifiant, nom ou
 * email d'utilisateur, organisation, projet, dépôt, installation, audit, commentaires, autre projet.
 */
const CRITERIA_INSTRUCTIONS = trusted`You help a product team write acceptance criteria. The feature is given as an untrusted data block. Produce a JSON object with a criteria array that replaces the current criteria. Each criterion has a title and steps; each step has a type (etant_donne, quand, alors or et) and a text on a single line. Order the steps Given (etant_donne), When (quand), Then (alors); et continues the previous step. Write in the language of the data. Use plain text only: no URL, no HTML, no markdown links or images.`;

const REVISE_INSTRUCTIONS = trusted`You help a product team revise one proposal for a specification. The current proposal, as JSON, and the revision request are given as untrusted data blocks. Return the revised proposal as a JSON object with exactly the same fields as the current proposal, taking the request into account. Keep every field that the request does not concern. Do not provide identifiers, statuses or links. Write in the language of the data. Use plain text only: no URL, no HTML, no markdown links or images.`;

const PREFILL_INSTRUCTIONS = trusted`You help a product team fill in the form of one feature of a specification. A one-sentence description written by a human is given as an untrusted data block. Return a JSON object with only the fields you can infer: title, priority (must, should, could or wont), description, criteria and links. Each criterion has a title and steps; each step has a type (etant_donne, quand, alors or et) and a text on a single line. Order the steps Given (etant_donne), When (quand), Then (alors); et continues the previous step. Omit any field you cannot infer instead of inventing it. Do not provide identifiers or statuses; links, when present, are references such as R-001 or S-accueil copied from the description. Write in the language of the data. Use plain text only: no URL, no HTML, no markdown links or images.`;

export const VERIFY_INSTRUCTIONS = trusted`This is a connectivity check of an API key. Reply with the single word OK.`;

/**
 * Consigne construite par le serveur à partir de constantes seulement (jamais d'un texte d'utilisateur ni d'une
 * donnée) : le gabarit `trusted` n'accepte que des littéraux, d'où ce passage par un tableau gelé.
 */
export function constantInstructions(text: string): Trusted {
  const strings = Object.freeze(Object.assign([text], { raw: Object.freeze([text]) }));
  return trusted(strings as unknown as TemplateStringsArray);
}

/**
 * Consigne de `proposeFeatures` pour une borne donnée. La borne est un entier de 1 à 20 fixé par
 * le serveur : la table est construite une fois, à partir de ces seuls entiers, jamais d'un texte.
 */
function featureInstructions(maxFeatures: number): Trusted {
  const text = `You help a product team write the functional specification of a project. The frozen project dossier, the synthesis and the assumptions and risks when present, and the current specification (features marked "no criteria" lack acceptance criteria) are given as untrusted data blocks. Do not propose again a feature that the current specification already contains. Propose at most ${maxFeatures} new features as a JSON object with a features array. Each feature has a title, a priority (must, should, could or wont), a description and a criteria array. Each criterion has a title and steps; each step has a type (etant_donne, quand, alors or et) and a text on a single line. Order the steps Given (etant_donne), When (quand), Then (alors); et continues the previous step. Do not provide identifiers, statuses or links. Write in the language of the data. Use plain text only: no URL, no HTML, no markdown links or images.`;
  return constantInstructions(text);
}

const FEATURE_INSTRUCTIONS: readonly Trusted[] = Array.from({ length: 20 }, (_, index) =>
  featureInstructions(index + 1),
);

const instructionsFor = (maxFeatures: number): Trusted => {
  const instructions = FEATURE_INSTRUCTIONS[maxFeatures - 1];
  if (instructions === undefined) throw new RangeError("maxFeatures hors de 1 à 20");
  return instructions;
};

const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim();

/** Sources de l'agent (dossier figé, Synthèse, risques, cahier actuel) : les mêmes blocs et troncatures que le job `agent-propose`. */
export function featuresPrompt(
  nonce: string,
  input: { sources: AgentSources; maxFeatures: number },
): FramedPrompt {
  return framePrompt({
    instructions: instructionsFor(input.maxFeatures),
    nonce,
    data: sourceBlocks(input.sources, null),
  });
}

function featureText(feature: FeatureDetail): string {
  const criteria = feature.criteria.map((criterion, index) => {
    const steps = criterion.steps.map((step) => `   - ${step.type}: ${step.text}`);
    return [`${index + 1}. ${criterion.title}`, ...steps].join("\n");
  });
  return [
    `${feature.specId} | ${oneLine(feature.title)} | ${feature.status} | ${feature.priority}`,
    `Description: ${feature.description}`,
    "Criteria:",
    ...criteria,
  ].join("\n");
}

export function criteriaPrompt(nonce: string, feature: FeatureDetail): FramedPrompt {
  return framePrompt({
    instructions: CRITERIA_INSTRUCTIONS,
    nonce,
    data: [new Untrusted("spec-file", featureText(feature))],
  });
}

/** Révision d'une proposition (TK-99a) : le contenu courant et la consigne entrent comme données non fiables. */
export function revisePrompt(
  nonce: string,
  input: { content: Readonly<Record<string, unknown>>; instruction: string },
): FramedPrompt {
  return framePrompt({
    instructions: REVISE_INSTRUCTIONS,
    nonce,
    data: [
      new Untrusted("spec-file", JSON.stringify(input.content)),
      new Untrusted("user-input", input.instruction),
    ],
  });
}

/** Préremplissage d'une fonctionnalité (TK-101) : la seule donnée est la phrase de l'humain, non fiable. */
export function prefillPrompt(nonce: string, description: string): FramedPrompt {
  return framePrompt({
    instructions: PREFILL_INSTRUCTIONS,
    nonce,
    data: [new Untrusted("user-input", description)],
  });
}

/** Constante : l'API refuse un message vide, « ping » n'a aucun lien avec l'utilisateur. */
export function verifyPrompt(nonce: string): FramedPrompt {
  return framePrompt({
    instructions: VERIFY_INSTRUCTIONS,
    nonce,
    data: [new Untrusted("user-input", "ping")],
  });
}
