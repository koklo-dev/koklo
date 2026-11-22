/**
 * Flux technique indexé tel que l'agent le relit (TK-114d, B655) : participants, messages, fonctionnalités, règles et
 * décisions, en forme de proposition (`from`/`to`/`text`/`reply`/`error`, blocs `alt` et `separator`) pour qu'une reprise
 * puisse être proposée telle quelle. Lecture tolérante de `data` (`de`/`vers`/`texte`/`retour`/`erreur`, `bloc`/`libelle`) :
 * un élément mal formé est ignoré.
 */
export interface CurrentFlowMessage {
  readonly from: string;
  readonly to: string;
  readonly text: string;
  readonly reply?: string;
  readonly error?: string;
}

export type CurrentFlowItem =
  | CurrentFlowMessage
  | {
      readonly block: "alt";
      readonly label: string;
      readonly messages: readonly CurrentFlowMessage[];
    }
  | { readonly block: "separator"; readonly label: string };

/** Flux technique : `participants` et suivants toujours remplis par le lecteur, facultatifs pour les fixtures. */
export interface CurrentArchflow {
  readonly specId: string;
  readonly title: string;
  readonly participants?: readonly string[];
  readonly messages?: readonly CurrentFlowItem[];
  readonly features?: readonly string[];
  readonly rules?: readonly string[];
  readonly decisions?: readonly string[];
}

const textOf = (value: unknown): string => (typeof value === "string" ? value : "");
const recordOf = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const idsOf = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function messageOf(value: unknown): CurrentFlowMessage | undefined {
  const item = recordOf(value);
  const from = textOf(item.de);
  const to = textOf(item.vers);
  const text = textOf(item.texte);
  if (from === "" || to === "" || text === "") return undefined;
  const reply = textOf(item.retour);
  const error = textOf(item.erreur);
  return { from, to, text, ...(reply === "" ? {} : { reply }), ...(error === "" ? {} : { error }) };
}

const messagesOf = (value: unknown): CurrentFlowMessage[] =>
  listOf(value).flatMap((entry) => messageOf(entry) ?? []);

function itemOf(value: unknown): CurrentFlowItem | undefined {
  const item = recordOf(value);
  if (item.bloc === undefined) return messageOf(item);
  const label = textOf(item.libelle);
  if (label === "") return undefined;
  if (item.bloc === "separateur") return { block: "separator", label };
  const messages = messagesOf(item.messages);
  return item.bloc === "alt" && messages.length > 0 ? { block: "alt", label, messages } : undefined;
}

export function archflowOf(row: { specId: string; data: unknown }): CurrentArchflow {
  const data = recordOf(row.data);
  return {
    specId: row.specId,
    title: textOf(data.titre),
    participants: idsOf(data.participants),
    messages: listOf(data.messages).flatMap((entry) => itemOf(entry) ?? []),
    features: idsOf(data.fonctionnalites),
    rules: idsOf(data.regles),
    decisions: idsOf(data.decisions),
  };
}
