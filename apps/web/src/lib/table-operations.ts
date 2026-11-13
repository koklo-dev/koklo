import type { SpecItem, SpecOperation } from "@koklo/contract";
import type { FormIssue } from "./feature-form.ts";

/**
 * Formulaire Table (TK-107, passation 11 §3, B385) : valeurs saisies, contrôle et opérations de `specBatch.submit`.
 * Les champs se saisissent à raison d'un par ligne : `nom · type · contrainte`, avec « clé primaire », la liste des
 * valeurs d'un `enum`, une règle entre parenthèses (`unique (R-001)`) et « données personnelles » en dernier segment.
 */
type Detail = Extract<SpecItem, { type: "table" }>["values"];
type Operation = SpecOperation;
type FieldOp = Extract<Operation, { kind: "table.create" }>["fields"][number];

export interface TableValues {
  name: string;
  zone: string;
  description: string;
  fieldsText: string;
  /** « Ce qu'on enregistre » : une phrase simple par ligne, lue par le client (B447). */
  clientSummaryText: string;
  personal: "yes" | "no";
  sources: string[];
}

export const EMPTY_TABLE: TableValues = {
  name: "",
  zone: "",
  description: "",
  fieldsText: "",
  clientSummaryText: "",
  personal: "no",
  sources: [],
};

const SUMMARY_MAX = 12;
const SUMMARY_LINE_MAX = 200;
const NAME_MAX = 120;
const ZONE_MAX = 80;
const FIELD_NAME = /^[a-z_][a-z0-9_]*$/;
const FIELD_TYPE =
  /^(uuid|texte\(\d+\)|entier|decimal|booleen|horodatage|date|enum|json|ref\(T-[a-z0-9][a-z0-9-]*\))$/;
const SOURCE = /^(F-\d{3,}|R-\d{3,})$/;
const RULE_SUFFIX = /\s*\((R-\d{3,})\)\s*$/;
const PRIMARY = "clé primaire";
const PERSONAL = "données personnelles";
const REQUIRED = "Ce champ est obligatoire.";
const TYPES_HINT =
  "uuid, texte(n), entier, decimal, booleen, horodatage, date, enum, json, ref(T-…)";

const trimmed = (text: string): string => text.trim();
const is = (segment: string, word: string): boolean => segment.toLowerCase() === word;
const issue = (field: string, message = REQUIRED): FormIssue => ({ field, message });

function parseConstraint(field: FieldOp, segment: string): FieldOp {
  if (field.type === "enum") {
    const values = segment.split(",").map(trimmed).filter(Boolean);
    return values.length > 0 ? { ...field, values } : field;
  }
  const rule = RULE_SUFFIX.exec(segment)?.[1];
  const text = segment.replace(RULE_SUFFIX, "").trim();
  return {
    ...field,
    ...(text ? { constraints: text } : {}),
    ...(rule ? { rule } : {}),
  };
}

function parseLine(line: string, number: number): { field?: FieldOp; error?: string } {
  const [name = "", type, ...rest] = line.split("·").map(trimmed);
  const at = `Ligne ${number}`;
  if (!FIELD_NAME.test(name)) {
    return { error: `${at} : « ${name} » n'est pas un nom de champ (minuscules, chiffres et _).` };
  }
  if (!type) return { error: `${at} : le champ « ${name} » n'a pas de type (${TYPES_HINT}).` };
  if (!FIELD_TYPE.test(type)) {
    return { error: `${at} : le type « ${type} » n'existe pas (${TYPES_HINT}).` };
  }
  let field: FieldOp = { name, type };
  for (const segment of rest.filter(Boolean)) {
    if (is(segment, PRIMARY)) field = { ...field, primaryKey: true };
    else if (is(segment, PERSONAL)) field = { ...field, personalData: true };
    else field = parseConstraint(field, segment);
  }
  if (type === "enum" && !field.values) {
    return { error: `${at} : un champ enum donne ses valeurs, séparées par des virgules.` };
  }
  return { field };
}

/** Lit les lignes de champs : les champs valides et un message par ligne refusée (numéro de ligne du texte saisi). */
export function parseFieldLines(text: string): { fields: FieldOp[]; errors: string[] } {
  const fields: FieldOp[] = [];
  const errors: string[] = [];
  for (const [index, raw] of text.split("\n").entries()) {
    const line = trimmed(raw);
    if (!line) continue;
    const { field, error } = parseLine(line, index + 1);
    if (error) errors.push(error);
    else if (field && fields.some((known) => known.name === field.name)) {
      errors.push(`Ligne ${index + 1} : le champ « ${field.name} » existe déjà.`);
    } else if (field) fields.push(field);
  }
  return { fields, errors };
}

/** Une ligne par champ : l'inverse de `parseFieldLines`. */
function lineOf(field: Detail["fields"][number]): string {
  const constraint =
    field.type === "enum"
      ? (field.values ?? []).join(", ")
      : [field.constraints, field.rule ? `(${field.rule})` : ""].filter(Boolean).join(" ");
  return [
    field.name,
    field.type,
    ...(field.primaryKey ? [PRIMARY] : []),
    ...(constraint ? [constraint] : []),
    ...(field.personalData ? [PERSONAL] : []),
  ].join(" · ");
}

export function tableValuesOf(item: Detail): TableValues {
  return {
    name: item.name,
    zone: item.zone ?? "",
    description: item.description,
    fieldsText: item.fields.map(lineOf).join("\n"),
    clientSummaryText: (item.clientSummary ?? []).join("\n"),
    personal: item.fields.some((field) => field.personalData) ? "yes" : "no",
    sources: [...item.sources],
  };
}

function personalIssue(values: TableValues, fields: readonly FieldOp[]): FormIssue[] {
  const flagged = fields.some((field) => field.personalData);
  if (values.personal === "yes" && !flagged) {
    return [issue("personal", `Indiquez le champ concerné : ajoutez « ${PERSONAL} » à sa ligne.`)];
  }
  if (values.personal === "no" && flagged) {
    return [
      issue(
        "personal",
        `Des champs sont marqués « ${PERSONAL} » : répondez Oui, ou retirez la mention.`,
      ),
    ];
  }
  return [];
}

const summaryLines = (text: string): string[] => text.split("\n").map(trimmed).filter(Boolean);

function summaryIssue(text: string): FormIssue[] {
  const lines = summaryLines(text);
  if (lines.length > SUMMARY_MAX) {
    return [issue("clientSummary", `${SUMMARY_MAX} phrases au plus : regroupez ou retirez-en.`)];
  }
  if (lines.some((line) => line.length > SUMMARY_LINE_MAX)) {
    return [issue("clientSummary", `Une phrase fait ${SUMMARY_LINE_MAX} caractères au plus.`)];
  }
  return [];
}

/** Points à corriger, dans l'ordre du formulaire : nom, zone, résumé, champs, données personnelles, justifications. */
export function tableIssues(values: TableValues): FormIssue[] {
  const parsed = parseFieldLines(values.fieldsText);
  const name = trimmed(values.name);
  const zone = trimmed(values.zone);
  return [
    ...(!name
      ? [issue("name")]
      : name.length > NAME_MAX
        ? [issue("name", `Au plus ${NAME_MAX} caractères.`)]
        : []),
    ...(!zone
      ? [issue("zone")]
      : zone.length > ZONE_MAX
        ? [issue("zone", `Au plus ${ZONE_MAX} caractères.`)]
        : []),
    ...(parsed.errors.length > 0
      ? [issue("fields", parsed.errors.join(" "))]
      : parsed.fields.length === 0
        ? [issue("fields")]
        : personalIssue(values, parsed.fields)),
    ...summaryIssue(values.clientSummaryText),
    ...(values.sources.some((source) => !SOURCE.test(source))
      ? [issue("sources", "Une fonctionnalité (F-001) ou une règle (R-001) par puce.")]
      : []),
  ].sort((a, b) => ORDER.indexOf(a.field) - ORDER.indexOf(b.field));
}

const ORDER = ["name", "zone", "clientSummary", "fields", "personal", "sources"];

function fieldsOf(values: TableValues) {
  return {
    name: trimmed(values.name),
    zone: trimmed(values.zone),
    description: trimmed(values.description),
    clientSummary: summaryLines(values.clientSummaryText),
    fields: parseFieldLines(values.fieldsText).fields,
    sources: values.sources,
  };
}

/** Création (description et justifications vides omises) ou, avec `edit`, modification des seuls champs changés. */
export function tableOperationOf(
  values: TableValues,
  edit?: { specId: string; baseline: TableValues },
): Operation | null {
  const next = fieldsOf(values);
  if (!edit) {
    return {
      kind: "table.create",
      name: next.name,
      zone: next.zone,
      ...(next.description ? { description: next.description } : {}),
      ...(next.clientSummary.length > 0 ? { clientSummary: next.clientSummary } : {}),
      ...(next.sources.length > 0 ? { sources: next.sources } : {}),
      fields: next.fields,
    };
  }
  const before = fieldsOf(edit.baseline);
  const changed = (Object.keys(next) as Array<keyof typeof next>).filter(
    (key) => JSON.stringify(next[key]) !== JSON.stringify(before[key]),
  );
  if (changed.length === 0) return null;
  return {
    kind: "table.update",
    specId: edit.specId,
    ...Object.fromEntries(changed.map((key) => [key, next[key]])),
  };
}
