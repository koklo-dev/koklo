import type { FunctionalItem } from "@koklo/contract";
import { buildMatrix, functionalItemOf } from "../spec-read/entity-values.ts";
import type { ValidationState } from "./validation.ts";

/**
 * Parcours, règles et rôles vus du client (B347) : langage simple, jamais le chemin du fichier ni un identifiant technique
 * (`functionalItemOf` les porte pour l'équipe, ils sont retirés ici). Lecture tolérante : une donnée absente garde sa
 * valeur neutre.
 */
type Row = { specId: string; path: string; data: unknown };
type Flow = Extract<FunctionalItem, { kind: "flow" }>;
type Rule = Extract<FunctionalItem, { kind: "rule" }>;

export function clientFlowOf(row: Row, state: ValidationState) {
  const item = functionalItemOf("flow", row) as Flow;
  return {
    id: item.specId,
    title: item.title,
    actor: item.actor,
    start: item.start,
    steps: item.steps,
    errors: item.errors,
    features: item.features,
    ...state,
  };
}

export function clientRuleOf(row: Row) {
  const item = functionalItemOf("rule", row) as Rule;
  return {
    id: item.specId,
    title: item.title,
    type: item.type,
    statement: item.statement,
    ...(item.example === undefined ? {} : { example: item.example }),
    states: item.states,
    features: item.features,
  };
}

/** Le fichier des rôles en entier : rôles et actions de tous les groupes (la validation porte sur le bloc). */
export function clientRolesOf(file: unknown) {
  const matrix = buildMatrix(file, { all: true });
  return {
    roles: matrix.roles.map(({ specId, name, description }) => ({
      id: specId,
      name,
      ...(description === undefined ? {} : { description }),
    })),
    actions: matrix.actions,
  };
}

/** Libellé lisible d'une entité : son titre, à défaut son nom, à défaut son identifiant. */
export function labelOf(id: string, data: unknown): string {
  const record = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
  for (const key of ["titre", "nom"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return id;
}

export interface LinkSources {
  rules: readonly string[];
  roles: readonly string[];
  screens: readonly string[];
}
export interface LabelRows {
  /** `specId -> données` des règles, parcours et écrans cités ; `roles` : le fichier des rôles. */
  rules: ReadonlyMap<string, unknown>;
  flows: ReadonlyMap<string, unknown>;
  screens: ReadonlyMap<string, unknown>;
  rolesFile: unknown;
}

/**
 * Liens de la fiche dans l'ordre de la maquette : règles, parcours, rôles, écrans ; chacun par libellé. Un élément cité mais
 * absent de l'index n'a pas de libellé : il n'est pas montré (jamais un identifiant seul).
 */
export function linksOf(source: LinkSources, labels: LabelRows): { id: string; label: string }[] {
  const roleNames = new Map(clientRolesOf(labels.rolesFile).roles.map((r) => [r.id, r.name]));
  const named = (ids: readonly string[], known: ReadonlyMap<string, unknown>) =>
    ids.filter((id) => known.has(id)).map((id) => ({ id, label: labelOf(id, known.get(id)) }));
  return [
    ...named(source.rules, labels.rules),
    ...[...labels.flows].map(([id, data]) => ({ id, label: labelOf(id, data) })),
    ...source.roles.flatMap((id) => {
      const name = roleNames.get(id);
      return name ? [{ id, label: name }] : [];
    }),
    ...named(source.screens, labels.screens),
  ];
}
