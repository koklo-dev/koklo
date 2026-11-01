import type { FeatureDetail } from "@koklo/contract";
import { featurePrioritySchema, featureStatusSchema } from "@koklo/contract";
import type { FeaturePriority, FeatureStatus, StepType } from "./feature-labels.ts";

/** Valeurs, validation et comparaison du formulaire d'une fonctionnalité (design/screens/S-feature-form.md §3). */
export interface StepValue {
  type: StepType;
  text: string;
}
export interface CriterionValue {
  /** `AC-n` d'un critère existant (lecture seule) ; absent pour un critère ajouté dans ce formulaire. */
  id?: string;
  /** Clé d'affichage d'un critère ajouté (jamais envoyée) : stable quand la liste est réordonnée. */
  key?: string;
  title: string;
  steps: StepValue[];
}
export interface FeatureFormValues {
  title: string;
  /** "" tant que la personne n'a rien choisi (aucune présélection). */
  priority: "" | FeaturePriority;
  status: FeatureStatus;
  description: string;
  criteria: CriterionValue[];
  /** Listes de liens : un identifiant par ligne (lignes vides ignorées). */
  screens: string;
  roles: string;
  rules: string;
  tables: string;
  endpoints: string;
  nfr: string;
}
export type FieldKey = keyof FeatureFormValues;
export interface FormIssue {
  /** `title`, `priority`, `criteria.<n>.title`, `criteria.<n>.steps.<m>.text` (n, m à partir de 1), `screens`, `roles`... */
  field: string;
  message: string;
}

export const LINK_FIELDS = ["screens", "roles", "rules", "tables", "endpoints", "nfr"] as const;
export type LinkField = (typeof LINK_FIELDS)[number];
/** Champs dans l'ordre du formulaire. */
export const FIELD_ORDER: readonly FieldKey[] = [
  "title",
  "priority",
  "status",
  "description",
  "criteria",
  ...LINK_FIELDS,
];
export const TITLE_MAX = 200;
export const EMPTY_VALUES: FeatureFormValues = {
  title: "",
  priority: "",
  status: "brouillon",
  description: "",
  criteria: [],
  screens: "",
  roles: "",
  rules: "",
  tables: "",
  endpoints: "",
  nfr: "",
};

const STEP_TYPES: readonly string[] = ["etant_donne", "quand", "alors", "et"];

/** Motif du contrat et exemple affiché pour chaque liste de liens. */
const LINK_RULES: Record<LinkField, { pattern: RegExp; example: string }> = {
  screens: { pattern: /^S-[a-z0-9][a-z0-9-]*$/, example: "S-inscription" },
  roles: { pattern: /^RL-[a-z0-9][a-z0-9-]*$/, example: "RL-admin" },
  rules: { pattern: /^R-\d{3,}$/, example: "R-001" },
  tables: { pattern: /^T-[a-z0-9][a-z0-9-]*$/, example: "T-utilisateur" },
  endpoints: { pattern: /^E-[a-z0-9][a-z0-9-]*$/, example: "E-connexion" },
  nfr: { pattern: /^NFR-[a-z0-9][a-z0-9-]*$/, example: "NFR-performance" },
};

export const isLinkField = (field: string): field is LinkField =>
  (LINK_FIELDS as readonly string[]).includes(field);

/** Exemple d'identifiant d'une liste de liens (aide sous le champ). */
export const linkExample = (field: LinkField): string => LINK_RULES[field].example;

const splitLines = (text: string): string[] => text.split(/\r?\n/);
/** Identifiants d'une liste de liens : espaces retirés, lignes vides ignorées. */
export function parseLinks(text: string): string[] {
  return splitLines(text)
    .map((line) => line.trim())
    .filter(Boolean);
}
/** Texte brut avec des retours à la ligne LF. */
export const normalizeText = (text: string): string => text.replace(/\r\n?/g, "\n");

/** Critères normalisés pour l'envoi et la comparaison : sans identifiant, textes sans espaces autour. */
export function normalizeCriteria(criteria: CriterionValue[]) {
  return criteria.map((criterion) => ({
    title: criterion.title.trim(),
    steps: criterion.steps.map((step) => ({ type: step.type, text: step.text.trim() })),
  }));
}

/** Valeur normalisée d'un champ, comparable par signature. */
function normalizedField(values: FeatureFormValues, field: FieldKey): unknown {
  if (field === "title") return values.title.trim();
  if (field === "description") return normalizeText(values.description);
  if (field === "criteria") return normalizeCriteria(values.criteria);
  if (isLinkField(field)) return parseLinks(values[field]);
  return values[field];
}

/** Vrai quand le champ a la même valeur normalisée dans les deux saisies. */
export function sameField(a: FeatureFormValues, b: FeatureFormValues, field: FieldKey): boolean {
  return JSON.stringify(normalizedField(a, field)) === JSON.stringify(normalizedField(b, field));
}

export function valuesFromDetail(detail: FeatureDetail): FeatureFormValues {
  return {
    title: detail.title,
    priority: detail.priority,
    status: detail.status,
    description: detail.description,
    criteria: detail.criteria.map((criterion) => ({
      id: criterion.specId,
      title: criterion.title,
      steps: criterion.steps.map((step) => ({ type: step.type, text: step.text })),
    })),
    screens: detail.screens.join("\n"),
    roles: detail.roles.join("\n"),
    rules: detail.rules.join("\n"),
    tables: detail.tables.join("\n"),
    endpoints: detail.endpoints.join("\n"),
    nfr: detail.nfr.join("\n"),
  };
}

function validateTitle(title: string): FormIssue[] {
  const length = title.trim().length;
  if (length === 0) return [{ field: "title", message: "Saisissez un titre." }];
  if (length > TITLE_MAX) {
    return [{ field: "title", message: "Le titre ne doit pas dépasser 200 caractères." }];
  }
  return [];
}

function validateCriteria(criteria: CriterionValue[]): FormIssue[] {
  const issues: FormIssue[] = [];
  criteria.forEach((criterion, index) => {
    const n = index + 1;
    if (!criterion.title.trim()) {
      issues.push({
        field: `criteria.${n}.title`,
        message: `Saisissez le titre du critère ${n}.`,
      });
    }
    criterion.steps.forEach((step, stepIndex) => {
      const m = stepIndex + 1;
      const where = `de l'étape ${m} du critère ${n}`;
      if (!STEP_TYPES.includes(step.type)) {
        issues.push({
          field: `criteria.${n}.steps.${m}.type`,
          message: `Choisissez le type ${where}.`,
        });
      }
      if (!step.text.trim()) {
        issues.push({
          field: `criteria.${n}.steps.${m}.text`,
          message: `Saisissez le texte de l'étape ${m} du critère ${n}.`,
        });
      }
    });
  });
  return issues;
}

function validateLinks(values: FeatureFormValues): FormIssue[] {
  const issues: FormIssue[] = [];
  for (const field of LINK_FIELDS) {
    const { pattern, example } = LINK_RULES[field];
    const lines = splitLines(values[field]).map((line) => line.trim());
    const index = lines.findIndex((line) => line !== "" && !pattern.test(line));
    if (index >= 0) {
      issues.push({
        field,
        message: `La ligne ${index + 1} n'est pas un identifiant valide (exemple : ${example}).`,
      });
    }
  }
  return issues;
}

/** Erreurs du formulaire dans l'ordre : titre, priorité, statut, critères, liens (= contrat, §3.1). */
export function validateFeatureForm(values: FeatureFormValues): FormIssue[] {
  const issues = validateTitle(values.title);
  if (!featurePrioritySchema.safeParse(values.priority).success) {
    issues.push({ field: "priority", message: "Choisissez une priorité." });
  }
  if (!featureStatusSchema.safeParse(values.status).success) {
    issues.push({ field: "status", message: "Choisissez un statut." });
  }
  return [...issues, ...validateCriteria(values.criteria), ...validateLinks(values)];
}

/** Champs dont la valeur normalisée diffère (titre sans espaces autour, CRLF=LF, liens sans lignes vides). */
export function diffValues(baseline: FeatureFormValues, values: FeatureFormValues): FieldKey[] {
  return FIELD_ORDER.filter((field) => !sameField(baseline, values, field));
}

const DESIGNER_MESSAGE = "Liez au moins un écran pour enregistrer cette fonctionnalité.";

/** Contrôle préalable du designer (S-feature-form §5.4) : `null` si la règle est respectée. */
export function checkDesignerScreens(
  mode: "create" | "update" | "delete",
  baseline: FeatureFormValues | null,
  values: FeatureFormValues,
): FormIssue | null {
  const linked = (candidate: FeatureFormValues) => parseLinks(candidate.screens).length > 0;
  const readLinked = baseline !== null && linked(baseline);
  // Suppression : seule la valeur lue compte, la saisie en cours est ignorée.
  const allowed =
    mode === "create"
      ? linked(values)
      : mode === "delete"
        ? readLinked
        : readLinked && linked(values);
  return allowed ? null : { field: "screens", message: DESIGNER_MESSAGE };
}
