import type { EntityKind } from "@koklo/ui";

interface Step {
  type: string;
  text: string;
}

const lower = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);
const upper = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
/** « que le client » mais « qu'il », « qu'un ». */
const que = (text: string): string =>
  /^[aeiouéèêàâîôû]/i.test(text) ? `qu'${text}` : `que ${text}`;

type Part = "given" | "when" | "result";
const PART_OF: Record<string, Part> = { etant_donne: "given", quand: "when", alors: "result" };

/**
 * Critère reformulé pour le client : « Si <étant donné> et que <quand>, alors <alors>. » (passation 06 §4.5).
 * Une étape « et » prolonge la partie qui la précède ; une partie absente se saute.
 */
export function criterionSentence(steps: readonly Step[]): string {
  const parts: Record<Part, string[]> = { given: [], when: [], result: [] };
  let current: Part = "given";
  for (const step of steps) {
    current = PART_OF[step.type] ?? current;
    parts[current].push(lower(step.text.trim().replace(/\.+$/, "")));
  }
  const { given, when, result } = parts;
  const condition = [
    given.length > 0 ? `si ${given.join(" et ")}` : "",
    when.length > 0
      ? `${given.length > 0 ? "et " : "quand "}${given.length > 0 ? que(when.join(" et ")) : when.join(" et ")}`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  const outcome = result.length > 0 ? `${condition ? "alors " : ""}${result.join(" et ")}` : "";
  return `${upper([condition, outcome].filter(Boolean).join(", "))}.`;
}

const KINDS: ReadonlyArray<readonly [string, EntityKind]> = [
  ["NFR-", "nfr"],
  ["RL-", "role"],
  ["R-", "rule"],
  ["S-", "screen"],
  ["T-", "table"],
  ["E-", "endpoint"],
  ["F-", "feature"],
];

/** Type d'un lien d'après son préfixe ; un parcours (`P-`) n'a pas de type d'entité : l'icône de lien générique le montre. */
export function linkKind(id: string): EntityKind {
  return KINDS.find(([prefix]) => id.startsWith(prefix))?.[1] ?? ("link" as EntityKind);
}
