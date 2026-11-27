import type { IssueCode } from "../codes.ts";
import { PATTERNS } from "../entities/ids.ts";
import { ruleIssue } from "../issue.ts";
import type { Issue, ParsedSpec } from "../types.ts";
import type { SpecIndex } from "./index.ts";
import type { Collect } from "./rule4-links.ts";

/** Une référence d'un fichier de la Sécurité : où elle est écrite et ce qu'elle désigne. */
interface Reference {
  readonly path: string;
  readonly entityId: string;
  readonly pointer: string;
  readonly id: string;
  /** Champ du modèle classé par une donnée : inconnu, il a « disparu ». */
  readonly field?: boolean;
}

type At = (pointer: string, id: string, field?: boolean) => Reference;

const referencesFrom =
  (path: string, entityId: string): At =>
  (pointer, id, field) => ({ path, entityId, pointer, id, ...(field && { field }) });

const listed = (at: At, base: string, ids: readonly string[]): Reference[] =>
  ids.map((id, i) => at(`${base}/${i}`, id));

const threatReferences = (spec: ParsedSpec): Reference[] =>
  spec.threats.flatMap(({ path, value }) => {
    const at = referencesFrom(path, value.id);
    return [
      ...listed(at, "/surfaces", value.surfaces).filter(({ id }) => PATTERNS.feature.test(id)),
      ...listed(at, "/liens", value.liens),
    ];
  });

const dataReferences = (spec: ParsedSpec): Reference[] =>
  spec.securityData.flatMap(({ path, value }) =>
    value.donnees.flatMap((entry, i) => {
      const at = referencesFrom(path, entry.champs[0] as string);
      return entry.champs.map((id, j) => at(`/donnees/${i}/champs/${j}`, id, true));
    }),
  );

const rightsReferences = (spec: ParsedSpec): Reference[] =>
  spec.rights.flatMap(({ path, value }) => {
    const at = referencesFrom(path, "rights");
    return value.restrictions.flatMap((entry, i) => [
      at(`/restrictions/${i}/role`, entry.role),
      at(`/restrictions/${i}/permission`, entry.permission),
    ]);
  });

const asvsReferences = (spec: ParsedSpec): Reference[] =>
  spec.asvs.flatMap(({ path, value }) =>
    value.exigences.flatMap((requirement, i) =>
      listed(
        referencesFrom(path, requirement.id),
        `/exigences/${i}/liens`,
        requirement.liens ?? [],
      ),
    ),
  );

type Known = (index: SpecIndex) => { has(id: string): boolean };
/** Cible attendue d'après le préfixe ; sans préfixe connu : opération ou champ. */
const BY_PREFIX: readonly (readonly [string, Known])[] = [
  ["F-", (index) => index.features],
  ["RL-", (index) => index.roles],
  ["PM-", (index) => index.permissions],
  ["T-", (index) => index.tables],
  ["NFR-", (index) => index.nfrs],
  ["ST-", (index) => index.stacks],
  ["ENV-", (index) => index.environments],
  ["SEC-", (index) => index.threats],
  ["S-", (index) => index.screens],
  ["R-", (index) => index.rules],
  ["ADR-", (index) => index.adrs],
  ["C-", (index) => index.components],
];

const tableOf = (id: string): string => `T-${id.slice(0, id.indexOf("."))}`;
const isModelField = (id: string, index: SpecIndex): boolean =>
  index.tables.get(tableOf(id))?.has(id.slice(id.indexOf(".") + 1)) ?? false;

function isKnown({ id, field }: Reference, index: SpecIndex): boolean {
  if (field) return isModelField(id, index);
  const known = BY_PREFIX.find(([prefix]) => id.startsWith(prefix))?.[1];
  if (known) return known(index).has(id);
  return index.endpoints.has(id) || isModelField(id, index);
}

interface Problem {
  readonly code: IssueCode;
  readonly message: string;
  /** Fonctionnalité et rôle inconnus bloquent ; le reste avertit. */
  readonly blocking?: true;
}

function problemOf({ id, field }: Reference, index: SpecIndex): Problem {
  if (id.startsWith("F-")) {
    const message = `La fonctionnalité ${id} n'existe pas.`;
    return { code: "SEC_UNKNOWN_FEATURE", message, blocking: true };
  }
  if (id.startsWith("RL-")) {
    const message = `Le rôle ${id} n'existe pas.`;
    return { code: "SEC_UNKNOWN_ROLE", message, blocking: true };
  }
  if (field || (id.includes(".") && index.tables.has(tableOf(id)))) {
    return { code: "SEC_UNKNOWN_FIELD", message: `Le champ ${id} n'existe pas dans le modèle.` };
  }
  return { code: "SEC_UNKNOWN_LINK", message: `La référence ${id} ne désigne rien.` };
}

/** Références de la Sécurité qui ne désignent rien, avec le problème signalé. */
function unknownReferences(spec: ParsedSpec, index: SpecIndex): [Reference, Problem][] {
  return [
    ...threatReferences(spec),
    ...dataReferences(spec),
    ...rightsReferences(spec),
    ...asvsReferences(spec),
  ]
    .filter((reference) => !isKnown(reference, index))
    .map((reference) => [reference, problemOf(reference, index)]);
}

/** Règle 4 appliquée à la Sécurité (TK-117) : F- et RL- inconnus sont des erreurs `SEC_UNKNOWN_*`. */
export function checkSecurityLinks(spec: ParsedSpec, index: SpecIndex, at: Collect): void {
  for (const [reference, problem] of unknownReferences(spec, index)) {
    if (!problem.blocking) continue;
    at(reference.path, reference.entityId)(problem.code, reference.pointer, problem.message);
  }
}

/** Avertissements (règle 7) : tout autre lien inconnu, et un champ classé disparu du modèle. */
export function checkSecurityWarnings(spec: ParsedSpec, index: SpecIndex): Issue[] {
  return unknownReferences(spec, index)
    .filter(([, problem]) => !problem.blocking)
    .map(([{ path, pointer, entityId }, { code, message }]) =>
      ruleIssue(7, code, path, pointer, entityId, message),
    );
}
