import type {
  AiPrefillItemOutput,
  SecurityDataEntryDetail,
  SpecOperation,
  ThreatDetail,
} from "@koklo/contract";
import { DATA_CATEGORY_PILL, type DataCategoryKind } from "@koklo/ui";
import type { FormIssue } from "./feature-form.ts";

/** Saisies des feuilles « Menace » et « Donnée » (maquette 15 l.706-715) et opérations de lot qu'elles écrivent. */
export interface ThreatValues {
  title: string;
  category: ThreatDetail["category"] | "";
  severity: ThreatDetail["severity"] | "";
  /** Identifiants `F-…` ou « API ». */
  surfaces: string[];
  risk: string;
  /** Une parade par ligne. */
  measures: string;
  verification: ThreatDetail["verification"] | "";
}

export const EMPTY_THREAT: ThreatValues = {
  title: "",
  category: "",
  severity: "",
  surfaces: [],
  risk: "",
  measures: "",
  verification: "",
};

/** Surface « API, secrets et intégrations » : écrite « API » à l'écran, `api` dans la spec. */
const API_TAG = "API";
export const SURFACE_TAG = /^(F-\d{3,}|api)$/i;

const lines = (text: string): string[] =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
const surfaceTag = (surface: string): string => (surface === "api" ? API_TAG : surface);
const surfaceValue = (tag: string): string =>
  tag.toLowerCase() === "api" ? "api" : tag.toUpperCase();

export const threatValuesOf = (detail: ThreatDetail): ThreatValues => ({
  title: detail.title,
  category: detail.category,
  severity: detail.severity,
  surfaces: detail.surfaces.map(surfaceTag),
  risk: detail.risk,
  measures: detail.measures.join("\n"),
  verification: detail.verification,
});

const required = (checks: ReadonlyArray<readonly [string, boolean]>): FormIssue[] =>
  checks.flatMap(([field, missing]) => (missing ? [{ field, message: "Obligatoire" }] : []));

export function threatIssues(values: ThreatValues): FormIssue[] {
  const unknown = values.surfaces.find((tag) => !SURFACE_TAG.test(tag));
  const issues = required([
    ["title", !values.title.trim()],
    ["category", !values.category],
    ["severity", !values.severity],
    ["surfaces", values.surfaces.length === 0],
    ["risk", !values.risk.trim()],
    ["measures", lines(values.measures).length === 0],
    ["verification", !values.verification],
  ]);
  if (!unknown) return issues;
  const message = `« ${unknown} » n'est ni une fonctionnalité (ex. F-004) ni « API ».`;
  return [...issues, { field: "surfaces", message }];
}

const threatFields = (values: ThreatValues) => ({
  title: values.title.trim(),
  category: values.category,
  severity: values.severity,
  surfaces: values.surfaces.map(surfaceValue),
  risk: values.risk.trim(),
  measures: lines(values.measures),
  verification: values.verification,
});

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const changesOf = (next: object, before: object): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(next).filter(
      ([key, value]) => !same(value, (before as Record<string, unknown>)[key]),
    ),
  );

interface Edit<V> {
  specId: string;
  baseline: V;
}

/** Création complète, ou les seuls champs changés ; `null` quand rien ne change. */
export function threatOperationOf(
  values: ThreatValues,
  edit?: Edit<ThreatValues>,
): SpecOperation | null {
  if (!edit) return { kind: "threat.create", ...threatFields(values) } as SpecOperation;
  const changes = changesOf(threatFields(values), threatFields(edit.baseline));
  if (Object.keys(changes).length === 0) return null;
  return { kind: "threat.update", specId: edit.specId, ...changes } as SpecOperation;
}

export interface SensitiveValues {
  data: string;
  /** « table.champ », plusieurs séparés par des virgules. */
  fields: string;
  category: DataCategoryKind | "";
  /** Saisie humaine seule (A7). */
  retention: string;
  access: string[];
  protection: string;
  /** Durée suggérée par l'agent : une aide, jamais la conservation. */
  suggestion: string;
}

export const EMPTY_SENSITIVE: SensitiveValues = {
  data: "",
  fields: "",
  category: "",
  retention: "",
  access: [],
  protection: "",
  suggestion: "",
};

export const DATA_CATEGORY_OPTIONS = (Object.keys(DATA_CATEGORY_PILL) as DataCategoryKind[]).map(
  (value) => ({ value, label: DATA_CATEGORY_PILL[value].label }),
);

/** Catégories qui exigent une durée avant la validation (B795). */
const KEPT: ReadonlySet<string> = new Set(["personal", "contact", "sensitive"]);
export const needsRetention = (category: string | undefined): boolean => KEPT.has(category ?? "");

const FIELD_OR_TABLE =
  /^([a-z0-9][a-z0-9-]{0,62}\.[a-z_][a-z0-9_]{0,62}|(T-)?[a-z0-9][a-z0-9-]{0,62})$/;
const fieldList = (text: string): string[] => text.split(/[\s,]+/).filter(Boolean);

export const sensitiveValuesOf = (detail: SecurityDataEntryDetail): SensitiveValues => ({
  data: detail.data ?? "",
  fields: detail.fields.join(", "),
  category: detail.category ?? "",
  retention: detail.retention ?? "",
  access: [...detail.access],
  protection: detail.protection ?? "",
  suggestion: detail.retentionSuggestion ?? "",
});

export function sensitiveIssues(values: SensitiveValues): FormIssue[] {
  const fields = fieldList(values.fields);
  const wrong = fields.find((field) => !FIELD_OR_TABLE.test(field));
  const issues = required([
    ["data", !values.data.trim()],
    ["fields", fields.length === 0],
    ["category", !values.category],
    ["retention", needsRetention(values.category) && !values.retention.trim()],
    ["access", values.access.length === 0],
  ]);
  if (!wrong) return issues;
  const message = `« ${wrong} » n'est pas un champ du modèle (ex. clients.telephone).`;
  return [...issues, { field: "fields", message }];
}

const sensitiveFields = (values: SensitiveValues) => ({
  data: values.data.trim(),
  fields: fieldList(values.fields),
  category: values.category,
  retention: values.retention.trim(),
  retentionSuggestion: values.suggestion.trim(),
  access: values.access,
  protection: values.protection.trim(),
});

/** À la création, un champ facultatif vide est absent ; à la modification, vide : la valeur est retirée. */
export function sensitiveOperationOf(
  values: SensitiveValues,
  edit?: Edit<SensitiveValues>,
): SpecOperation | null {
  const next = sensitiveFields(values);
  if (!edit) {
    const written = Object.entries(next).filter(([, value]) => value !== "");
    return { kind: "sensitive.create", ...Object.fromEntries(written) } as SpecOperation;
  }
  const changes = changesOf(next, sensitiveFields(edit.baseline));
  if (Object.keys(changes).length === 0) return null;
  return { kind: "sensitive.update", specId: edit.specId, ...changes } as SpecOperation;
}

const defined = (entries: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(entries).filter(([, value]) => value !== undefined));

/** Sortie du préremplissage d'une menace : parades en lignes, « API » comme à l'écran. */
export function threatPrefillValues(output: AiPrefillItemOutput): Record<string, unknown> {
  if (output.type !== "threat") return {};
  const { measures, surfaces, ...values } = output.values;
  return defined({
    ...values,
    measures: measures?.join("\n"),
    surfaces: surfaces?.map(surfaceTag),
  });
}

/** Sortie du préremplissage d'une donnée : jamais de conservation, la suggestion devient une aide (A7). */
export function sensitivePrefillValues(output: AiPrefillItemOutput): Record<string, unknown> {
  if (output.type !== "sensitive") return {};
  const { field, data, category, access, protection, retentionSuggestion } = output.values;
  return defined({
    fields: field,
    data,
    category,
    access,
    protection,
    suggestion: retentionSuggestion,
  });
}
