import type { SpecItem, SpecOperation } from "@koklo/contract";
import type { FormIssue } from "./feature-form.ts";

/**
 * Formulaires Règle, Rôle et Parcours (TK-103, 11 §3) : valeurs saisies, contrôle des champs obligatoires et
 * opérations de `specBatch.submit`. Un seul module : les trois types partagent les mêmes gestes.
 */
type Item<T extends SpecItem["type"]> = Extract<SpecItem, { type: T }>["values"];
type Operation = SpecOperation;

const REQUIRED = "Ce champ est obligatoire.";
const PERMISSION = /^(PM-[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*)(?:\s*\((.+)\))?$/;
const SCREEN = /^S-[a-z0-9][a-z0-9-]*$/;
const trimmed = (text: string): string => text.trim();
const lines = (text: string): string[] => text.split("\n").map(trimmed).filter(Boolean);
const issue = (field: string, message = REQUIRED): FormIssue => ({ field, message });
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

// --- Saisies à plat ---
/** Une puce de permission : « PM-ressource.action », avec sa restriction entre parenthèses. */
export const isPermissionTag = (tag: string): boolean => PERMISSION.test(tag.trim());

export interface ParsedPermission {
  id: string;
  restriction?: string;
}

/** « PM-ressource.action (restriction) » par puce ; une puce mal formée est ignorée (`roleIssues` la refuse avant). */
export function parsePermissions(tags: readonly string[]): ParsedPermission[] {
  return tags.flatMap((tag) => {
    const match = PERMISSION.exec(tag.trim());
    if (!match?.[1]) return [];
    const restriction = match[2]?.trim();
    return [{ id: match[1], ...(restriction ? { restriction } : {}) }];
  });
}

export interface ParsedStep {
  label: string;
  screen?: string;
}

/** « libellé · écran » : l'écran (`S-…`) est facultatif, « — » vaut absent. */
function parseStep(line: string): ParsedStep {
  const cut = line.lastIndexOf("·");
  if (cut === -1) return { label: line.trim() };
  const label = line.slice(0, cut).trim();
  const screen = line.slice(cut + 1).trim();
  return screen && screen !== "—" ? { label, screen } : { label };
}

export const parseSteps = (text: string): ParsedStep[] => lines(text).map(parseStep);

export interface ParsedError {
  step: number;
  text: string;
}

const ERROR_LINE = /^Étape\s+(\d{1,2})\s*:\s*(.+)$/u;

/** « Étape n : situation → ce qui se passe », une par ligne ; une ligne mal formée est ignorée. */
export function parseErrors(text: string): ParsedError[] {
  return lines(text).flatMap((line) => {
    const match = ERROR_LINE.exec(line);
    return match?.[1] && match[2] ? [{ step: Number(match[1]), text: match[2].trim() }] : [];
  });
}

const stepText = (step: ParsedStep): string =>
  step.screen ? `${step.label} · ${step.screen}` : step.label;

// --- Règle ---
export type RuleKind = "contrainte" | "calcul" | "workflow";
export interface RuleValues {
  title: string;
  type: RuleKind;
  statement: string;
  example: string;
  /** Noms des états d'un workflow ; le premier est l'état initial. */
  states: string[];
  features: string[];
}
export const EMPTY_RULE: RuleValues = {
  title: "",
  type: "contrainte",
  statement: "",
  example: "",
  states: [],
  features: [],
};

export function ruleValuesOf(item: Item<"rule">): RuleValues {
  return {
    title: item.title,
    type: item.type,
    statement: item.statement,
    example: item.examples.join("\n"),
    states: [...item.states],
    features: [...item.features],
  };
}

export function ruleIssues(values: RuleValues): FormIssue[] {
  return [
    ...(trimmed(values.title) ? [] : [issue("title")]),
    ...(trimmed(values.statement) ? [] : [issue("statement")]),
    ...(values.type === "workflow" && values.states.length === 0
      ? [issue("states", "Un workflow à états porte au moins un état.")]
      : []),
  ];
}

function ruleFields(values: RuleValues): Record<string, unknown> {
  const example = trimmed(values.example);
  return {
    title: trimmed(values.title),
    type: values.type,
    statement: trimmed(values.statement),
    examples: example ? [example] : [],
    states: values.type === "workflow" ? values.states : [],
    features: values.features,
  };
}

/** Création (champs vides omis) ou, avec `edit`, modification des seuls champs changés ; `null` si rien n'a changé. */
export function ruleOperationOf(
  values: RuleValues,
  edit?: { specId: string; baseline: RuleValues },
): Operation | null {
  return operationOf(
    "rule",
    ruleFields(values),
    edit && { ...edit, baseline: ruleFields(edit.baseline) },
    ["title", "type", "statement"],
  );
}

// --- Rôle ---
export interface RoleValues {
  name: string;
  description: string;
  /** Puces « PM-ressource.action (restriction) ». */
  permissions: string[];
}
export const EMPTY_ROLE: RoleValues = { name: "", description: "", permissions: [] };

export function roleValuesOf(item: Item<"role">): RoleValues {
  return {
    name: item.name,
    description: item.description,
    permissions: item.permissions.map((permission) =>
      permission.restriction
        ? `${permission.specId} (${permission.restriction})`
        : permission.specId,
    ),
  };
}

export function roleIssues(values: RoleValues): FormIssue[] {
  const valid = values.permissions.length > 0 && values.permissions.every(isPermissionTag);
  return [
    ...(trimmed(values.name) ? [] : [issue("name")]),
    ...(trimmed(values.description) ? [] : [issue("description")]),
    ...(valid
      ? []
      : [
          issue(
            "permissions",
            values.permissions.length === 0
              ? REQUIRED
              : "Une permission s'écrit PM-ressource.action, avec sa restriction entre parenthèses.",
          ),
        ]),
  ];
}

function roleFields(values: RoleValues): Record<string, unknown> {
  return {
    name: trimmed(values.name),
    description: trimmed(values.description),
    permissions: parsePermissions(values.permissions),
  };
}

export function roleOperationOf(
  values: RoleValues,
  edit?: { specId: string; baseline: RoleValues },
): Operation | null {
  return operationOf(
    "role",
    roleFields(values),
    edit && { ...edit, baseline: roleFields(edit.baseline) },
    ["name", "description", "permissions"],
  );
}

// --- Parcours ---
export interface FlowValues {
  title: string;
  actor: string;
  /** « libellé · écran » du point de départ. */
  start: string;
  /** Une étape par ligne : « libellé · écran ». */
  steps: string;
  /** Un cas par ligne : « Étape n : situation → ce qui se passe ». */
  errors: string;
  features: string[];
}
export const EMPTY_FLOW: FlowValues = {
  title: "",
  actor: "",
  start: "",
  steps: "",
  errors: "",
  features: [],
};

export function flowValuesOf(item: Item<"flow">): FlowValues {
  return {
    title: item.title,
    actor: item.actor,
    start: stepText(item.start),
    steps: item.steps.map(stepText).join("\n"),
    errors: item.errors.map((error) => `Étape ${error.step} : ${error.text}`).join("\n"),
    features: [...item.features],
  };
}

function flowStepsIssues(values: FlowValues): FormIssue[] {
  const steps = parseSteps(values.steps);
  const badScreen = [parseStep(values.start), ...steps].some(
    (step) => step.screen !== undefined && !SCREEN.test(step.screen),
  );
  if (steps.length === 0) return [issue("steps")];
  return badScreen ? [issue("steps", "Un écran s'écrit S-nom, après « · ».")] : [];
}

function flowErrorsIssues(values: FlowValues): FormIssue[] {
  const raw = lines(values.errors);
  const parsed = parseErrors(values.errors);
  const reach = parseSteps(values.steps).length + 1;
  const valid =
    parsed.length === raw.length && parsed.every((error) => error.step >= 1 && error.step <= reach);
  return valid
    ? []
    : [issue("errors", "Un cas s'écrit « Étape n : situation », n étant une étape du parcours.")];
}

export function flowIssues(values: FlowValues): FormIssue[] {
  return [
    ...(trimmed(values.title) ? [] : [issue("title")]),
    ...(trimmed(values.actor) ? [] : [issue("actor")]),
    ...(trimmed(values.start) ? [] : [issue("start")]),
    ...flowStepsIssues(values),
    ...flowErrorsIssues(values),
  ];
}

function flowFields(values: FlowValues): Record<string, unknown> {
  return {
    title: trimmed(values.title),
    actor: trimmed(values.actor),
    start: parseStep(trimmed(values.start)),
    steps: parseSteps(values.steps),
    errors: parseErrors(values.errors),
    features: values.features,
  };
}

export function flowOperationOf(
  values: FlowValues,
  edit?: { specId: string; baseline: FlowValues },
): Operation | null {
  return operationOf(
    "flow",
    flowFields(values),
    edit && { ...edit, baseline: flowFields(edit.baseline) },
    ["title", "actor", "start", "steps"],
  );
}

// --- Commun ---
const isEmpty = (value: unknown): boolean => Array.isArray(value) && value.length === 0;

/**
 * `kind.create` : les champs obligatoires toujours, les autres s'ils sont renseignés ; `kind.update` : les champs
 * qui diffèrent de la fiche d'origine, `null` quand aucun ne diffère (le contrat exige un champ modifié).
 */
function operationOf(
  kind: "rule" | "role" | "flow",
  fields: Record<string, unknown>,
  edit: { specId: string; baseline: Record<string, unknown> } | undefined,
  required: readonly string[],
): Operation | null {
  if (!edit) {
    const kept = Object.entries(fields).filter(
      ([key, value]) => required.includes(key) || !isEmpty(value),
    );
    return { kind: `${kind}.create`, ...Object.fromEntries(kept) } as unknown as Operation;
  }
  const changed = Object.entries(fields).filter(([key, value]) => !same(value, edit.baseline[key]));
  if (changed.length === 0) return null;
  return {
    kind: `${kind}.update`,
    specId: edit.specId,
    ...Object.fromEntries(changed),
  } as unknown as Operation;
}
