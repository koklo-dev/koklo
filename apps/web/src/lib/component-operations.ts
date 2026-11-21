import type { SpecItem, SpecOperation } from "@koklo/contract";
import type { FormIssue } from "./feature-form.ts";

/**
 * Formulaire Composant (TK-111, passation 11 §3, maquette 16 l.149-153) : valeurs saisies, contrôle et opérations de
 * `specBatch.submit`. « Dépend de » se saisit en puces `C-db · SQL` (composant · moyen), suivies de `· asynchrone` pour
 * un appel par file ou événement : seul mode qui échappe à la détection de cycle.
 */
type Detail = Extract<SpecItem, { type: "component" }>["values"];
type Operation = SpecOperation;
type ComponentType = "app" | "service" | "store" | "queue" | "ext";
type Dependency = { to: string; via: string; async?: boolean };

export interface ComponentValues {
  name: string;
  type: ComponentType | "";
  zone: string;
  responsibility: string;
  /** Tables possédées (`T-…`). */
  owns: string[];
  /** Puces `C-db · SQL`, `C-queue · planifie · asynchrone`. */
  dependsOn: string[];
  /** Fonctionnalités servies (`F-…`). */
  serves: string[];
}

export const EMPTY_COMPONENT: ComponentValues = {
  name: "",
  type: "",
  zone: "",
  responsibility: "",
  owns: [],
  dependsOn: [],
  serves: [],
};

export const COMPONENT_TYPES: ReadonlyArray<{ value: ComponentType; label: string }> = [
  { value: "app", label: "Application" },
  { value: "service", label: "Service" },
  { value: "store", label: "Stockage" },
  { value: "queue", label: "File de tâches" },
  { value: "ext", label: "Externe" },
];

const NAME_MAX = 120;
const ZONE_MAX = 120;
const RESPONSIBILITY_MAX = 500;
const VIA_MAX = 120;
const REQUIRED = "Ce champ est obligatoire.";
const TABLE = /^T-[a-z0-9][a-z0-9-]*$/;
const FEATURE = /^F-\d{3,}$/;
const DEPENDENCY = /^(C-[a-z0-9][a-z0-9-]*)\s*·\s*(.+?)(\s*·\s*asynchrone)?$/;
const ASYNC = "asynchrone";

const trimmed = (text: string): string => text.trim();
const issue = (field: string, message = REQUIRED): FormIssue => ({ field, message });

/** Lit une puce « Dépend de » : composant visé, moyen, mode asynchrone ; `null` quand elle n'a pas la forme attendue. */
export function parseDependency(chip: string): Dependency | null {
  const match = DEPENDENCY.exec(chip.trim());
  if (!match?.[1] || !match[2]) return null;
  const via = match[2].trim();
  if (!via || via.length > VIA_MAX) return null;
  return { to: match[1], via, ...(match[3] ? { async: true } : {}) };
}

/** Explication d'une puce « Dépend de » refusée (`null` si elle est correcte). */
export function dependencyTag(tag: string): string | null {
  return parseDependency(tag)
    ? null
    : `« ${tag} » : écrivez le composant puis le moyen, par exemple C-db · SQL (ajoutez · ${ASYNC} pour un appel par file).`;
}

const dependencyChip = (link: Dependency): string =>
  `${link.to} · ${link.via}${link.async ? ` · ${ASYNC}` : ""}`;

export function componentValuesOf(item: Detail): ComponentValues {
  return {
    name: item.name,
    type: item.type,
    zone: item.zone,
    responsibility: item.responsibility,
    owns: [...item.owns],
    dependsOn: item.dependsOn.map(dependencyChip),
    serves: [...item.serves],
  };
}

function lengthIssue(field: string, text: string, max: number): FormIssue[] {
  if (!text) return [issue(field)];
  return text.length > max ? [issue(field, `Au plus ${max} caractères.`)] : [];
}

const tagsIssue = (field: string, tags: readonly string[], pattern: RegExp, hint: string) =>
  tags.some((tag) => !pattern.test(tag)) ? [issue(field, hint)] : [];

/** Points à corriger, dans l'ordre du formulaire : nom, type, zone, responsabilité, possède, dépend de, sert. */
export function componentIssues(values: ComponentValues): FormIssue[] {
  return [
    ...lengthIssue("name", trimmed(values.name), NAME_MAX),
    ...(values.type ? [] : [issue("type", "Choisissez un type.")]),
    ...lengthIssue("zone", trimmed(values.zone), ZONE_MAX),
    ...lengthIssue("responsibility", trimmed(values.responsibility), RESPONSIBILITY_MAX),
    ...tagsIssue("owns", values.owns, TABLE, "Une table (T-client) par puce."),
    ...(values.dependsOn.some((chip) => !parseDependency(chip))
      ? [issue("dependsOn", "Composant · moyen, par exemple C-db · SQL.")]
      : []),
    ...tagsIssue("serves", values.serves, FEATURE, "Une fonctionnalité (F-001) par puce."),
  ];
}

function fieldsOf(values: ComponentValues) {
  return {
    name: trimmed(values.name),
    type: values.type as ComponentType,
    zone: trimmed(values.zone),
    responsibility: trimmed(values.responsibility),
    owns: values.owns,
    dependsOn: values.dependsOn.flatMap((chip) => parseDependency(chip) ?? []),
    serves: values.serves,
  };
}

/** Création (listes vides omises) ou, avec `edit`, modification des seuls champs changés. */
export function componentOperationOf(
  values: ComponentValues,
  edit?: { specId: string; baseline: ComponentValues },
): Operation | null {
  const next = fieldsOf(values);
  if (!edit) {
    return {
      kind: "component.create",
      name: next.name,
      type: next.type,
      zone: next.zone,
      responsibility: next.responsibility,
      ...(next.owns.length > 0 ? { owns: next.owns } : {}),
      ...(next.dependsOn.length > 0 ? { dependsOn: next.dependsOn } : {}),
      ...(next.serves.length > 0 ? { serves: next.serves } : {}),
    };
  }
  const before = fieldsOf(edit.baseline);
  const changed = (Object.keys(next) as Array<keyof typeof next>).filter(
    (key) => JSON.stringify(next[key]) !== JSON.stringify(before[key]),
  );
  if (changed.length === 0) return null;
  return {
    kind: "component.update",
    specId: edit.specId,
    ...Object.fromEntries(changed.map((key) => [key, next[key]])),
  } as Operation;
}
