import { type Adr, AdrSchema } from "../entities/index.ts";
import { toPointer } from "../parse/zod-issues.ts";
import { EmitError } from "./errors.ts";
import { inlineList, isOneLine, yamlScalar } from "./yaml-inline.ts";

export class EmitAdrError extends EmitError {
  constructor(message: string, path: string) {
    super("EmitAdrError", message, path);
  }
}

const assertLine = (value: string, path: string): void => {
  if (!isOneLine(value)) throw new EmitAdrError("une seule ligne, sans espace de bord", path);
};

function assertBody(body: string, path: string): void {
  if (body.includes("\r") || body.includes("\0")) {
    throw new EmitAdrError("retour chariot ou caractère NUL interdit", path);
  }
  for (const line of body.split("\n")) {
    if (/^##(\s|$)/.test(line) || line.trimEnd() === "---") {
      throw new EmitAdrError("ligne structurelle interdite dans le texte", path);
    }
  }
}

const bullets = (title: string, items: readonly string[], path: string): string[] => {
  for (const [i, entry] of items.entries()) assertLine(entry, `${path}/${i}`);
  return items.length === 0 ? [] : [`### ${title}`, ...items.map((entry) => `- ${entry}`), ""];
};

function alternatives(items: Adr["alternatives"]): string[] {
  for (const [i, { nom, raison }] of items.entries()) {
    assertLine(nom, `/alternatives/${i}/nom`);
    assertLine(raison, `/alternatives/${i}/raison`);
    if (nom.includes("**"))
      throw new EmitAdrError("`**` interdit dans un nom", `/alternatives/${i}/nom`);
  }
  if (items.length === 0) return [];
  return ["## Alternatives", ...items.map(({ nom, raison }) => `- **${nom}** : ${raison}`), ""];
}

/**
 * Décision -> Markdown canonique : front matter à ordre de clés FIXE (listes en style flux) puis `## Contexte`,
 * `## Décision`, `## Conséquences` (### Positives, ### À accepter), `## Alternatives`, `## En clair`.
 * Pure ; ne lève que `EmitAdrError`. `parseAdrMarkdown(emit(a))` rend `a`, et l'émission est idempotente.
 */
export function emitAdrMarkdown(adr: Adr): string {
  const checked = AdrSchema.safeParse(adr);
  if (!checked.success) {
    const issue = checked.error.issues[0];
    throw new EmitAdrError(issue?.message ?? "décision invalide", toPointer(issue?.path ?? []));
  }
  const value = checked.data;
  assertLine(value.titre, "/titre");
  for (const [i, name] of value.decideurs.entries()) assertLine(name, `/decideurs/${i}`);
  const bodies = {
    "/contexte": value.contexte.trim(),
    "/decision": value.decision.trim(),
    "/en_clair": (value.en_clair ?? "").trim(),
  };
  for (const [path, body] of Object.entries(bodies)) assertBody(body, path);
  const lines = [
    "---",
    `id: ${value.id}`,
    `titre: ${yamlScalar(value.titre)}`,
    `statut: ${value.statut}`,
    ...(value.remplacee_par === undefined ? [] : [`remplacee_par: ${value.remplacee_par}`]),
    `date: ${value.date}`,
    `decideurs: ${inlineList(value.decideurs)}`,
    `liens: ${inlineList(value.liens)}`,
    "---",
    "",
    "## Contexte",
    bodies["/contexte"],
    "",
    "## Décision",
    bodies["/decision"],
    "",
    "## Conséquences",
    ...bullets("Positives", value.consequences.positives, "/consequences/positives"),
    ...bullets("À accepter", value.consequences.a_accepter, "/consequences/a_accepter"),
    ...alternatives(value.alternatives),
    ...(bodies["/en_clair"] === "" ? [] : ["## En clair", bodies["/en_clair"], ""]),
  ];
  return `${lines.join("\n").trimEnd()}\n`;
}
