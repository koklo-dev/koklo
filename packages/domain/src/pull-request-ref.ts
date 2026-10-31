/** Référence d'une PR GitHub lue dans `Ticket.pullRequest` (format : URL de la PR). */
export type ParsedPullRequestRef = {
  readonly owner: string;
  readonly name: string;
  readonly number: number;
};

const MAX_PULL_REQUEST_NUMBER = 2_147_483_647;
const PULL_REQUEST_URL =
  /^https:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100})\/pull\/([1-9][0-9]{0,9})$/;

/**
 * Lit `https://github.com/<owner>/<repo>/pull/<n>`, rien d'autre : analyse ancrée, sans
 * normalisation, qui rend `undefined` (jamais d'exception) pour tout autre texte, afin qu'une
 * référence forgée ne désigne jamais un autre dépôt que celui qu'elle nomme.
 */
export function parsePullRequestRef(text: string): ParsedPullRequestRef | undefined {
  if (typeof text !== "string") return undefined;
  const match = PULL_REQUEST_URL.exec(text);
  if (!match) return undefined;
  const [, owner, name, digits] = match;
  const number = Number(digits);
  if (!owner || !name || name === "." || name === ".." || number > MAX_PULL_REQUEST_NUMBER) {
    return undefined;
  }
  return { owner, name, number };
}
