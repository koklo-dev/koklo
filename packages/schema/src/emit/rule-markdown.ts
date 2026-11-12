import { stringify } from "yaml";
import { type BusinessRule, BusinessRuleSchema } from "../entities/index.ts";
import { toPointer } from "../parse/zod-issues.ts";

/** Erreur typée : `path` est le pointeur JSON de la valeur refusée. */
export class EmitRuleError extends Error {
  readonly path: string;

  constructor(message: string, path: string) {
    super(`${message} (${path === "" ? "racine" : path})`);
    this.name = "EmitRuleError";
    this.path = path;
  }
}

/** Élément de liste en style flux : nu s'il est sûr, sinon cité en JSON (une virgule ou un crochet couperait la liste). */
const item = (value: string): string =>
  /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) ? value : JSON.stringify(value);

const flow = (items: readonly string[] | undefined): string =>
  `[${(items ?? []).map(item).join(", ")}]`;

/** Scalaire YAML sûr sur une ligne (JSON en repli : YAML valide). */
function scalar(value: string): string {
  const text = stringify(value, { lineWidth: 0 }).trimEnd();
  return text.includes("\n") ? JSON.stringify(value) : text;
}

function assertLine(value: string, path: string): void {
  if (/[\r\n\0\u2028\u2029]/.test(value) || value !== value.trim()) {
    throw new EmitRuleError("une seule ligne, sans espace de bord", path);
  }
}

function assertStatement(text: string): void {
  if (text.includes("\r") || text.includes("\0")) {
    throw new EmitRuleError("retour chariot ou caractère NUL interdit", "/enonce");
  }
  for (const line of text.split("\n")) {
    if (/^##(\s|$)/.test(line) || line.trimEnd() === "---") {
      throw new EmitRuleError("ligne structurelle interdite dans l'énoncé", "/enonce");
    }
  }
}

/**
 * Règle -> Markdown canonique : front matter à ordre de clés FIXE (listes en style flux), `## Énoncé`, puis
 * `## Exemples` (une puce par exemple). Pure ; ne lève que `EmitRuleError`. `parseRuleMarkdown(emit(r))` rend `r`.
 */
export function emitRuleMarkdown(rule: BusinessRule): string {
  const checked = BusinessRuleSchema.safeParse(rule);
  if (!checked.success) {
    const issue = checked.error.issues[0];
    throw new EmitRuleError(issue?.message ?? "règle invalide", toPointer(issue?.path ?? []));
  }
  const value = checked.data;
  const statement = value.enonce.trim();
  assertStatement(statement);
  if (value.titre !== undefined) assertLine(value.titre, "/titre");
  for (const [i, state] of (value.etats ?? []).entries()) assertLine(state, `/etats/${i}`);
  for (const [i, example] of value.exemples.entries()) assertLine(example, `/exemples/${i}`);
  const lines = [
    "---",
    `id: ${value.id}`,
    ...(value.titre === undefined ? [] : [`titre: ${scalar(value.titre)}`]),
    `type: ${value.type}`,
    `tables: ${flow(value.tables)}`,
    `endpoints: ${flow(value.endpoints)}`,
    ...(value.etats === undefined ? [] : [`etats: ${flow(value.etats)}`]),
    ...(value.fonctionnalites === undefined
      ? []
      : [`fonctionnalites: ${flow(value.fonctionnalites)}`]),
    "---",
    "",
    "## Énoncé",
    statement,
    "",
    "## Exemples",
    ...value.exemples.map((example) => `- ${example}`),
  ];
  return `${lines.join("\n")}\n`;
}
