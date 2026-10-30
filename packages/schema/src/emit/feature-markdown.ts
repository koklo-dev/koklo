import { stringify } from "yaml";
import { type Criterion, type Feature, FeatureSchema } from "../entities/index.ts";
import { CRITERIA_TITLE, DESCRIPTION_TITLE, STEP_LABEL_BY_TYPE } from "../markdown-vocabulary.ts";
import { toPointer } from "../parse/zod-issues.ts";

/** Erreur typée : `path` est le pointeur JSON de la valeur refusée. */
export class EmitFeatureError extends Error {
  readonly path: string;

  constructor(message: string, path: string) {
    super(`${message} (${path === "" ? "racine" : path})`);
    this.name = "EmitFeatureError";
    this.path = path;
  }
}

const LINK_KEYS = ["tables", "endpoints", "ecrans", "roles", "regles", "nfr"] as const;

/** Une seule ligne, sans caractère de contrôle de saut : sinon le texte sortirait de sa ligne. */
function assertSingleLine(value: string, path: string): void {
  if (value.includes("\r") || value.includes("\n") || value.includes("\0")) {
    throw new EmitFeatureError("saut de ligne ou caractère NUL interdit", path);
  }
}

/** Ligne de Markdown relue à l'identique : ni espace de bord (le parseur les retire). */
function assertTrimmedLine(value: string, path: string): void {
  assertSingleLine(value, path);
  if (value !== value.trim()) {
    throw new EmitFeatureError("espace en début ou en fin de texte interdit", path);
  }
}

function assertDescription(description: string): void {
  if (description.includes("\r") || description.includes("\0")) {
    throw new EmitFeatureError("retour chariot ou caractère NUL interdit", "/description");
  }
  for (const line of description.split("\n")) {
    if (/^##\s/.test(line) || /^##$/.test(line) || line.trimEnd() === "---") {
      throw new EmitFeatureError(
        "ligne structurelle (`## ...` ou `---`) interdite dans la description",
        "/description",
      );
    }
  }
}

function assertCriteria(criteres: readonly Criterion[]): void {
  const seen = new Set<string>();
  for (const [i, criterion] of criteres.entries()) {
    if (seen.has(criterion.id)) {
      throw new EmitFeatureError("identifiant de critère dupliqué", `/criteres/${i}/id`);
    }
    seen.add(criterion.id);
    assertTrimmedLine(criterion.titre, `/criteres/${i}/titre`);
    for (const [j, step] of criterion.etapes.entries()) {
      assertTrimmedLine(step.texte, `/criteres/${i}/etapes/${j}/texte`);
    }
  }
}

/** Scalaire YAML sûr (citations ajoutées si nécessaire), sur une ligne, sans ancre ni étiquette. */
function yamlScalar(value: string): string {
  const text = stringify(value, { lineWidth: 0 }).trimEnd();
  // Bloc littéral (`|-`) pour un marqueur de document tel que `---` : on cite en JSON (YAML valide).
  return text.includes("\n") ? JSON.stringify(value) : text;
}

function criterionLines(criterion: Criterion): string[] {
  return [
    "",
    `### ${criterion.id} — ${criterion.titre}`,
    ...criterion.etapes.map((step) => `- **${STEP_LABEL_BY_TYPE[step.type]}** ${step.texte}`),
  ];
}

/**
 * Feature -> Markdown canonique (annexe A §4.2) : front matter à ordre de clés FIXE, listes de
 * liens en style flux, `## Description`, puis les critères `### AC-n — titre` et leurs étapes.
 * Fonction pure ; ne lève que `EmitFeatureError`. L'ordre des listes et des critères est conservé.
 * `parseFeatureMarkdown(emit(f))` rend `f`, et l'émission est idempotente.
 */
export function emitFeatureMarkdown(feature: Feature): string {
  const checked = FeatureSchema.safeParse(feature);
  if (!checked.success) {
    const issue = checked.error.issues[0];
    throw new EmitFeatureError(issue?.message ?? "feature invalide", toPointer(issue?.path ?? []));
  }
  const value = checked.data;
  assertSingleLine(value.titre, "/titre");
  const description = value.description.trim();
  assertDescription(description);
  assertCriteria(value.criteres);
  const lines = [
    "---",
    `id: ${value.id}`,
    `titre: ${yamlScalar(value.titre)}`,
    `statut: ${value.statut}`,
    `priorite: ${value.priorite}`,
    ...LINK_KEYS.map((key) => `${key}: [${value[key].join(", ")}]`),
    "---",
    "",
    `## ${DESCRIPTION_TITLE}`,
    ...(description === "" ? [] : [description]),
    "",
    `## ${CRITERIA_TITLE}`,
    ...value.criteres.flatMap(criterionLines),
  ];
  return `${lines.join("\n")}\n`;
}
