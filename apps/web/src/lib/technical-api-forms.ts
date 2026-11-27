import type {
  AiPrefillItemOutput,
  NfrDetail,
  OperationDetail,
  SpecOperation,
} from "@koklo/contract";
import type { FormIssue } from "./feature-form.ts";
import { issuesFrom, lineIssue, operationFor, REQUIRED } from "./technical-operations.ts";

/**
 * Feuilles « Opération » et « Exigence » (TK-116, maquette 14 l.893-902) : les listes d'une opération se saisissent une
 * ligne par élément, cellules séparées par « · ». Une modification n'envoie que les champs changés ; le composant d'une
 * opération et le détail de vérification d'une exigence restent ceux du fichier (B769).
 */
type OperationCreate = Extract<SpecOperation, { kind: "op.create" }>;
type NfrCreate = Extract<SpecOperation, { kind: "nfr.create" }>;

export interface OperationValues {
  name: string;
  type: OperationCreate["type"] | "";
  zone: string;
  summary: string;
  permission: string;
  input: string;
  output: string;
  errors: string;
  /** Règles `R-` et fonctionnalités `F-`. */
  links: string[];
  rateLimit: string;
}

export const EMPTY_OPERATION: OperationValues = {
  name: "",
  type: "",
  zone: "",
  summary: "",
  permission: "",
  input: "",
  output: "",
  errors: "",
  links: [],
  rateLimit: "",
};

const OPERATION_NAME = /^[a-z0-9][A-Za-z0-9_-]*\.[a-z0-9][A-Za-z0-9_-]*$/;
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_.[\]]*$/;
const RULE = /^R-\d{3,}$/;
const OPERATION_LINK = /^[RF]-\d{3,}$/;
const NO_RULE = "—";
const SEPARATOR = "·";
const LIMITS = { name: 120, zone: 80, summary: 500, field: 80, type: 120, text: 300, code: 80 };
const FIELDS_MAX = 40;
const ERRORS_MAX = 20;
const RATE_MAX = 200;

const cellsOf = (line: string): string[] => line.split(SEPARATOR).map((cell) => cell.trim());
const linesOf = (text: string): string[] =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

function parseField(line: string, extra: "constraint" | "note") {
  const [field = "", type = "", ...rest] = cellsOf(line);
  const text = rest.join(` ${SEPARATOR} `);
  return { field, type, ...(text ? { [extra]: text } : {}) };
}

/** « CODE · quand · règle » : la troisième cellule est la règle (« — » ou absente : aucune). */
function parseError(line: string) {
  const [code = "", ...rest] = cellsOf(line);
  const rule = rest.length > 1 ? (rest.pop() ?? "") : "";
  const when = rest.join(` ${SEPARATOR} `);
  return { code, when, ...(rule && rule !== NO_RULE ? { rule } : {}) };
}

const within = (text: string, max: number): boolean => text.length > 0 && text.length <= max;

function validField(line: string): boolean {
  const [field = "", type = "", ...rest] = cellsOf(line);
  const named = within(field, LIMITS.field) && FIELD_NAME.test(field);
  return named && within(type, LIMITS.type) && rest.join(" · ").length <= LIMITS.text;
}

function validError(line: string): boolean {
  const { code, when, rule } = parseError(line);
  const ruled = rule === undefined || RULE.test(rule);
  return within(code, LIMITS.code) && within(when, LIMITS.text) && ruled;
}

interface ListRule {
  valid: (line: string) => boolean;
  max: number;
  expected: string;
}

/** Première ligne fautive, désignée par son numéro dans la zone de saisie. */
function listIssue(text: string, { valid, max, expected }: ListRule): string | false {
  if (linesOf(text).length > max) return `Au plus ${max} lignes.`;
  const lines = text.split("\n").map((line) => line.trim());
  const at = lines.findIndex((line) => line !== "" && !valid(line));
  return at >= 0 && `Ligne ${at + 1} : ${expected}`;
}

const FIELD_RULE: ListRule = {
  valid: validField,
  max: FIELDS_MAX,
  expected: "un nom de champ et un type sont attendus.",
};
const ERROR_RULE: ListRule = {
  valid: validError,
  max: ERRORS_MAX,
  expected: "un code, un « quand » et, au besoin, une règle R-001 sont attendus.",
};

/** Liste obligatoire, sauf si l'opération modifiée n'en avait aucune (comme B766). */
function requiredList(text: string, before: string | undefined): string | false {
  if (!text.trim()) return before?.trim() === "" ? false : REQUIRED;
  return listIssue(text, FIELD_RULE);
}

function nameIssue(name: string): string | false {
  const text = name.trim();
  if (!text) return REQUIRED;
  const ok = text.length <= LIMITS.name && OPERATION_NAME.test(text);
  return !ok && "Nom attendu : zone.verbe, ex. avis.create.";
}

/** Le contrat ne sait pas retirer une limite : elle se remplace, elle ne se vide pas. */
function rateIssue(value: string, before: string | undefined): string | false {
  if (!value.trim() && before) return "La limite ne se retire pas d'ici : saisissez-en une.";
  return value.trim().length > RATE_MAX && `Au plus ${RATE_MAX} caractères.`;
}

export function operationIssues(values: OperationValues, baseline?: OperationValues): FormIssue[] {
  const strange = values.links.find((link) => !OPERATION_LINK.test(link));
  return issuesFrom([
    ["name", nameIssue(values.name)],
    ["type", !values.type && "Choisissez un type."],
    ["zone", lineIssue(values.zone, LIMITS.zone)],
    ["summary", lineIssue(values.summary, LIMITS.summary)],
    ["permission", !values.permission && "Choisissez une permission."],
    ["input", requiredList(values.input, baseline?.input)],
    ["output", requiredList(values.output, baseline?.output)],
    ["errors", listIssue(values.errors, ERROR_RULE)],
    ["links", strange !== undefined && `« ${strange} » n'est ni une règle ni une fonctionnalité.`],
    ["rateLimit", rateIssue(values.rateLimit, baseline?.rateLimit)],
  ]);
}

function operationFieldsOf(values: OperationValues) {
  return {
    name: values.name.trim(),
    type: values.type,
    zone: values.zone.trim(),
    summary: values.summary.trim(),
    permission: values.permission,
    input: linesOf(values.input).map((line) => parseField(line, "constraint")),
    output: linesOf(values.output).map((line) => parseField(line, "note")),
    errors: linesOf(values.errors).map(parseError),
    rules: values.links.filter((link) => link.startsWith("R-")),
    features: values.links.filter((link) => link.startsWith("F-")),
    rateLimit: values.rateLimit.trim(),
  };
}

export const operationOperationOf = (
  values: OperationValues,
  edit?: { specId: string; baseline: OperationValues },
): SpecOperation | null => operationFor("op", operationFieldsOf, values, edit);

/** Une ligne par élément ; un retour à la ligne du fichier devient une espace. */
const lineOf = (cells: ReadonlyArray<string | undefined>): string =>
  cells
    .filter(Boolean)
    .join(` ${SEPARATOR} `)
    .replace(/\s*\n\s*/g, " ");

type Lists = Pick<OperationDetail, "input" | "output" | "errors">;

const inputText = (rows: Lists["input"]): string =>
  rows.map((row) => lineOf([row.field, row.type, row.constraint])).join("\n");
const outputText = (rows: Lists["output"]): string =>
  rows.map((row) => lineOf([row.field, row.type, row.note])).join("\n");
const errorText = (rows: Lists["errors"]): string =>
  rows.map((row) => lineOf([row.code, row.when, row.rule])).join("\n");

export function operationValuesOf(item: OperationDetail): OperationValues {
  return {
    name: item.specId,
    type: item.type,
    zone: item.zone,
    summary: item.summary,
    permission: item.permission,
    input: inputText(item.input),
    output: outputText(item.output),
    errors: errorText(item.errors),
    links: [...item.rules, ...item.features],
    rateLimit: item.rateLimit ?? "",
  };
}

type PrefilledOperation = Extract<AiPrefillItemOutput, { type: "operation" }>["values"];

/** Préremplissage de l'agent : ses listes deviennent le texte des zones de saisie. */
export function operationPrefillValues(values: PrefilledOperation) {
  const { input, output, errors, links, ...rest } = values;
  return {
    ...rest,
    ...(input ? { input: inputText(input) } : {}),
    ...(output ? { output: outputText(output) } : {}),
    ...(errors ? { errors: errorText(errors) } : {}),
    ...(links ? { links: links.filter((link) => OPERATION_LINK.test(link)) } : {}),
  };
}

export interface NfrValues {
  category: NfrCreate["category"] | "";
  title: string;
  target: string;
  statement: string;
  verification: NfrCreate["verification"] | "";
  links: string[];
}

export const EMPTY_NFR: NfrValues = {
  category: "",
  title: "",
  target: "",
  statement: "",
  verification: "",
  links: [],
};

export const NFR_LINK = /^(C-[a-z0-9][a-z0-9-]*|ST-[a-z0-9][a-z0-9-]*|ADR-\d{3,}|R-\d{3,})$/;

export function nfrIssues(values: NfrValues): FormIssue[] {
  const strange = values.links.find((link) => !NFR_LINK.test(link));
  return issuesFrom([
    ["category", !values.category && "Choisissez une catégorie."],
    ["title", lineIssue(values.title, 200)],
    ["target", lineIssue(values.target, 120)],
    ["statement", lineIssue(values.statement, 1000)],
    ["verification", !values.verification && "Choisissez une vérification."],
    ["links", strange !== undefined && `« ${strange} » n'est pas un lien d'exigence.`],
  ]);
}

const nfrFieldsOf = (values: NfrValues) => ({
  category: values.category,
  title: values.title.trim(),
  target: values.target.trim(),
  statement: values.statement.trim(),
  verification: values.verification,
  links: values.links,
});

export const nfrOperationOf = (
  values: NfrValues,
  edit?: { specId: string; baseline: NfrValues },
): SpecOperation | null => operationFor("nfr", nfrFieldsOf, values, edit);

export function nfrValuesOf(item: NfrDetail): NfrValues {
  return {
    category: item.category,
    title: item.title,
    target: item.target,
    statement: item.statement,
    verification: item.verification,
    links: [...item.links],
  };
}
