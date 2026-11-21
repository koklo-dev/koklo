import type { SpecItem, SpecOperation } from "@koklo/contract";
import type { FormIssue } from "./feature-form.ts";

/**
 * Formulaire Décision (TK-113, B586, maquette 13 l.956-958) : valeurs saisies, contrôle et opérations `adr.create|update`
 * de `specBatch.submit`. Les conséquences se saisissent une par ligne, les alternatives « nom · raison » une par ligne.
 * Aucun préremplissage par l'agent (B586).
 */
type Detail = Extract<SpecItem, { type: "adr" }>["values"];
type Status = "proposee" | "acceptee" | "remplacee";
type Alternative = { name: string; reason: string };

export interface AdrValues {
  title: string;
  status: Status;
  /** Décision remplaçante (`ADR-nnn`), seulement pour une décision remplacée. */
  supersededBy: string;
  context: string;
  decision: string;
  positives: string;
  accepted: string;
  /** Une alternative par ligne : « nom · raison ». */
  alternatives: string;
  /** Composants, fonctionnalités, règles, tables, parcours (`C-`, `F-`, `R-`, `T-`, `P-`). */
  links: string[];
}

export const EMPTY_ADR: AdrValues = {
  title: "",
  status: "proposee",
  supersededBy: "",
  context: "",
  decision: "",
  positives: "",
  accepted: "",
  alternatives: "",
  links: [],
};

export const ADR_STATUS_OPTIONS: ReadonlyArray<{ value: Status; label: string }> = [
  { value: "proposee", label: "Proposée" },
  { value: "acceptee", label: "Acceptée" },
  { value: "remplacee", label: "Remplacée" },
];

const TITLE_MAX = 200;
const TEXT_MAX = 2000;
const LINE_MAX = 300;
const NAME_MAX = 120;
const LINES_MAX = 10;
const ALTERNATIVES_MAX = 6;
const LINKS_MAX = 30;
const REQUIRED = "Ce champ est obligatoire.";
const ADR = /^ADR-\d{3,}$/;
const LINK = /^(F-\d{3,}|R-\d{3,}|T-[a-z0-9][a-z0-9-]*|C-[a-z0-9][a-z0-9-]*|P-[a-z0-9][a-z0-9-]*)$/;
const SEPARATOR = " · ";

export const adrLinkTag = (tag: string): string | null =>
  LINK.test(tag)
    ? null
    : `« ${tag} » n'est pas un lien (composant C-api, fonctionnalité F-001, règle R-001, table T-client, parcours P-reserver).`;

const trimmed = (text: string): string => text.trim();
const linesOf = (text: string): string[] =>
  text
    .split("\n")
    .map(trimmed)
    .filter((line) => line !== "");
const issue = (field: string, message = REQUIRED): FormIssue => ({ field, message });

/** Lit « nom · raison » ligne à ligne : `null` si une ligne n'a pas la forme (nom et raison non vides). */
export function parseAlternatives(text: string): Alternative[] | null {
  const parsed: Alternative[] = [];
  for (const line of linesOf(text)) {
    const at = line.indexOf(SEPARATOR);
    const name = at === -1 ? "" : line.slice(0, at).trim();
    const reason = at === -1 ? "" : line.slice(at + SEPARATOR.length).trim();
    if (!name || !reason) return null;
    parsed.push({ name, reason });
  }
  return parsed;
}

export function adrValuesOf(item: Detail): AdrValues {
  return {
    title: item.title,
    status: item.status,
    supersededBy: item.supersededBy ?? "",
    context: item.context,
    decision: item.decision,
    positives: item.consequences.positive.join("\n"),
    accepted: item.consequences.toAccept.join("\n"),
    alternatives: item.alternatives.map((a) => `${a.name}${SEPARATOR}${a.reason}`).join("\n"),
    links: [...item.links],
  };
}

function lengthIssue(field: string, text: string, max: number): FormIssue[] {
  if (!text) return [issue(field)];
  return text.length > max ? [issue(field, `Au plus ${max} caractères.`)] : [];
}

function linesIssue(field: string, text: string): FormIssue[] {
  const lines = linesOf(text);
  if (lines.length > LINES_MAX) return [issue(field, `Au plus ${LINES_MAX} lignes.`)];
  return lines.some((line) => line.length > LINE_MAX)
    ? [issue(field, `Au plus ${LINE_MAX} caractères par ligne.`)]
    : [];
}

function alternativesIssue(text: string): FormIssue[] {
  const parsed = parseAlternatives(text);
  if (!parsed) return [issue("alternatives", "Une alternative par ligne : nom · raison.")];
  if (parsed.length > ALTERNATIVES_MAX) {
    return [issue("alternatives", `Au plus ${ALTERNATIVES_MAX} alternatives.`)];
  }
  const long = parsed.some((a) => a.name.length > NAME_MAX || a.reason.length > LINE_MAX);
  return long ? [issue("alternatives", "Nom : 120 caractères, raison : 300 au plus.")] : [];
}

/** Points à corriger, dans l'ordre du formulaire. */
export function adrIssues(values: AdrValues): FormIssue[] {
  return [
    ...lengthIssue("title", trimmed(values.title), TITLE_MAX),
    ...(values.status === "remplacee" && !ADR.test(trimmed(values.supersededBy))
      ? [issue("supersededBy", "Indiquez la décision qui la remplace (ADR-003).")]
      : []),
    ...lengthIssue("context", trimmed(values.context), TEXT_MAX),
    ...lengthIssue("decision", trimmed(values.decision), TEXT_MAX),
    ...linesIssue("positives", values.positives),
    ...linesIssue("accepted", values.accepted),
    ...alternativesIssue(values.alternatives),
    ...(values.links.length > LINKS_MAX || values.links.some((tag) => adrLinkTag(tag))
      ? [issue("links", "Un lien valide par puce (C-api, F-001…), 30 au plus.")]
      : []),
  ];
}

function fieldsOf(values: AdrValues) {
  return {
    title: trimmed(values.title),
    status: values.status,
    ...(values.status === "remplacee" ? { supersededBy: trimmed(values.supersededBy) } : {}),
    context: trimmed(values.context),
    decision: trimmed(values.decision),
    positives: linesOf(values.positives),
    accepted: linesOf(values.accepted),
    alternatives: parseAlternatives(values.alternatives) ?? [],
    links: values.links,
  };
}

const EMPTY_LISTS = ["positives", "accepted", "alternatives", "links"] as const;

/** Création (champs vides omis) ou, avec `edit`, modification des seuls champs changés. */
export function adrOperationOf(
  values: AdrValues,
  edit?: { specId: string; baseline: AdrValues },
): SpecOperation | null {
  const next: Record<string, unknown> = fieldsOf(values);
  if (!edit) {
    for (const key of EMPTY_LISTS) {
      if ((next[key] as unknown[]).length === 0) delete next[key];
    }
    return { kind: "adr.create", ...next } as SpecOperation;
  }
  const before: Record<string, unknown> = fieldsOf(edit.baseline);
  const changed = Object.keys(next).filter(
    (key) => JSON.stringify(next[key]) !== JSON.stringify(before[key]),
  );
  if (changed.length === 0) return null;
  return {
    kind: "adr.update",
    specId: edit.specId,
    ...Object.fromEntries(changed.map((key) => [key, next[key]])),
  } as SpecOperation;
}
