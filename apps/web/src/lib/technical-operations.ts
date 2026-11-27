import type { SpecItem, SpecOperation, StackDetail } from "@koklo/contract";
import type { FormIssue } from "./feature-form.ts";

/**
 * Feuilles « Choix technique » et « Environnement » (TK-115, maquette 14 l.888-907) : valeurs saisies, contrôle et
 * opérations de `specBatch.submit`. Une modification n'envoie que les champs changés.
 */
type EnvironmentDetail = Extract<SpecItem, { type: "environment" }>["values"];
type StackCreate = Extract<SpecOperation, { kind: "stack.create" }>;
type EnvironmentCreate = Extract<SpecOperation, { kind: "env.create" }>;

export interface StackValues {
  role: string;
  components: string[];
  status: StackCreate["status"] | "";
  choice: string;
  options: string[];
  /** Noms des critères ; leurs valeurs restent dans le fichier (B719). */
  criteria: string[];
  why: string;
  requirements: string[];
}

export const EMPTY_STACK: StackValues = {
  role: "",
  components: [],
  status: "",
  choice: "",
  options: [],
  criteria: [],
  why: "",
  requirements: [],
};

export interface EnvironmentValues {
  name: string;
  address: string;
  hosting: string;
  database: string;
  data: EnvironmentCreate["data"] | "";
  deployment: NonNullable<EnvironmentCreate["deployment"]> | "";
  access: string;
}

export const EMPTY_ENVIRONMENT: EnvironmentValues = {
  name: "",
  address: "",
  hosting: "",
  database: "",
  data: "",
  deployment: "",
  access: "",
};

const REQUIRED = "Ce champ est obligatoire.";
const NAME_MAX = 120;
const LINE_MAX = 200;
const WHY_MAX = 1000;
const OPTIONS_MIN = 2;
const OPTIONS_MAX = 8;
const CRITERIA_MAX = 12;

type Check = [field: string, message: string | false];

const issuesFrom = (checks: Check[]): FormIssue[] =>
  checks.flatMap(([field, message]) => (message ? [{ field, message }] : []));

const lineIssue = (text: string, max: number): string | false => {
  const length = text.trim().length;
  if (length === 0) return REQUIRED;
  return length > max && `Au plus ${max} caractères.`;
};

function optionsIssue(options: readonly string[]): string | false {
  if (options.length < OPTIONS_MIN) return "Deux options au moins.";
  return options.length > OPTIONS_MAX && `Au plus ${OPTIONS_MAX} options.`;
}

function criteriaIssue(criteria: readonly string[]): string | false {
  if (criteria.length === 0) return REQUIRED;
  return criteria.length > CRITERIA_MAX && `Au plus ${CRITERIA_MAX} critères.`;
}

/**
 * Points à corriger, dans l'ordre du formulaire. `baseline` : le choix modifié ; sans composant au départ (« Pour
 * toute l'équipe »), il se modifie sans en ajouter (B766).
 */
export function stackIssues(values: StackValues, baseline?: StackValues): FormIssue[] {
  const teamWide = baseline?.components.length === 0;
  return issuesFrom([
    ["role", lineIssue(values.role, NAME_MAX)],
    ["components", values.components.length === 0 && !teamWide && REQUIRED],
    ["status", !values.status && "Choisissez un statut."],
    ["choice", values.status === "chosen" && lineIssue(values.choice, LINE_MAX)],
    ["options", optionsIssue(values.options)],
    ["criteria", criteriaIssue(values.criteria)],
    ["why", lineIssue(values.why, WHY_MAX)],
  ]);
}

export function environmentIssues(values: EnvironmentValues): FormIssue[] {
  return issuesFrom([
    ["name", lineIssue(values.name, NAME_MAX)],
    ["address", lineIssue(values.address, LINE_MAX)],
    ["hosting", lineIssue(values.hosting, LINE_MAX)],
    ["database", lineIssue(values.database, LINE_MAX)],
    ["data", !values.data && "Choisissez les données."],
    ["deployment", !values.deployment && "Choisissez le déploiement."],
    ["access", values.access.trim().length > LINE_MAX && `Au plus ${LINE_MAX} caractères.`],
  ]);
}

export function stackValuesOf(item: StackDetail): StackValues {
  return {
    role: item.role,
    components: [...item.components],
    status: item.status,
    choice: item.choice ?? "",
    options: [...item.options],
    criteria: item.criteria.map((criterion) => criterion.label),
    why: item.why,
    requirements: [...item.requirements],
  };
}

export function environmentValuesOf(item: EnvironmentDetail): EnvironmentValues {
  return {
    name: item.name,
    address: item.address,
    hosting: item.hosting,
    database: item.database,
    data: item.data,
    deployment: item.deployment ?? "",
    access: item.access ?? "",
  };
}

type Fields = Record<string, unknown>;

/** Champs changés depuis la saisie de départ ; un champ vidé devenu `undefined` n'est pas envoyé. */
function changedOf(next: Fields, before: Fields): Fields {
  return Object.fromEntries(
    Object.entries(next).filter(
      ([key, value]) =>
        value !== undefined && JSON.stringify(value) !== JSON.stringify(before[key]),
    ),
  );
}

function stackFieldsOf(values: StackValues): Fields {
  return {
    role: values.role.trim(),
    components: values.components,
    status: values.status,
    // « À trancher » ne porte jamais de choix.
    choice: values.status === "chosen" ? values.choice.trim() : undefined,
    options: values.options,
    criteria: values.criteria.map((label) => ({ label })),
    why: values.why.trim(),
    requirements: values.requirements,
  };
}

const environmentFieldsOf = (values: EnvironmentValues): Fields => ({
  name: values.name.trim(),
  address: values.address.trim(),
  hosting: values.hosting.trim(),
  database: values.database.trim(),
  data: values.data,
  deployment: values.deployment || undefined,
  // Vide à la modification : la rubrique quitte le fichier (B765) ; à la création, elle est omise.
  access: values.access.trim(),
});

const defined = (fields: Fields): Fields =>
  Object.fromEntries(
    Object.entries(fields).filter(
      ([, value]) =>
        value !== undefined && value !== "" && !(Array.isArray(value) && value.length === 0),
    ),
  );

function operationFor<V>(
  kind: "stack" | "env",
  fieldsOf: (values: V) => Fields,
  values: V,
  edit: { specId: string; baseline: V } | undefined,
): SpecOperation | null {
  const next = fieldsOf(values);
  if (!edit) return { kind: `${kind}.create`, ...defined(next) } as unknown as SpecOperation;
  const changed = changedOf(next, fieldsOf(edit.baseline));
  if (Object.keys(changed).length === 0) return null;
  return { kind: `${kind}.update`, specId: edit.specId, ...changed } as unknown as SpecOperation;
}

export const stackOperationOf = (
  values: StackValues,
  edit?: { specId: string; baseline: StackValues },
): SpecOperation | null => operationFor("stack", stackFieldsOf, values, edit);

export const environmentOperationOf = (
  values: EnvironmentValues,
  edit?: { specId: string; baseline: EnvironmentValues },
): SpecOperation | null => operationFor("env", environmentFieldsOf, values, edit);
