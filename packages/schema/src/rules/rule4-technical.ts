import type { IssueCode } from "../codes.ts";
import { ruleIssue } from "../issue.ts";
import type { Issue, ParsedSpec } from "../types.ts";
import type { SpecIndex } from "./index.ts";
import type { Collect } from "./rule4-links.ts";

/** Une référence d'un fichier technique : où elle est écrite et ce qu'elle désigne. */
interface Reference {
  readonly path: string;
  readonly entityId: string;
  readonly pointer: string;
  readonly id: string;
}

type Target = Readonly<{
  prefix: string;
  known: (index: SpecIndex) => { has(id: string): boolean };
  code: IssueCode;
  label: string;
  /** Les exigences et les choix s'enregistrent dans un ordre libre (B721) : avertir sans bloquer. */
  warns?: true;
}>;

const TARGETS: readonly Target[] = [
  {
    prefix: "C-",
    known: (index) => index.components,
    code: "TECH_UNKNOWN_COMPONENT",
    label: "Le composant",
  },
  {
    prefix: "ADR-",
    known: (index) => index.adrs,
    code: "TECH_UNKNOWN_DECISION",
    label: "La décision",
  },
  {
    prefix: "F-",
    known: (index) => index.features,
    code: "TECH_UNKNOWN_FEATURE",
    label: "La fonctionnalité",
  },
  { prefix: "R-", known: (index) => index.rules, code: "TECH_UNKNOWN_RULE", label: "La règle" },
  {
    prefix: "NFR-",
    known: (index) => index.nfrs,
    code: "TECH_UNKNOWN_NFR",
    label: "L'exigence",
    warns: true,
  },
  {
    prefix: "ST-",
    known: (index) => index.stacks,
    code: "TECH_UNKNOWN_STACK",
    label: "Le choix technique",
    warns: true,
  },
];

type At = (pointer: string, id: string) => Reference;

const referencesFrom =
  (path: string, entityId: string): At =>
  (pointer, id) => ({ path, entityId, pointer, id });

const listed = (at: At, base: string, ids: readonly string[]): Reference[] =>
  ids.map((id, i) => at(`${base}/${i}`, id));

function stackReferences(spec: ParsedSpec): Reference[] {
  return spec.stacks.flatMap(({ path, value }) => {
    const at = referencesFrom(path, value.id);
    return [
      ...listed(at, "/composants", value.composants),
      ...listed(at, "/exigences", value.exigences),
      ...listed(at, "/decisions", value.decisions),
    ];
  });
}

function operationReferences(spec: ParsedSpec): Reference[] {
  return spec.operations.flatMap(({ path, value }) => {
    const at = referencesFrom(path, value.id);
    return [
      at("/composant", value.composant),
      ...listed(at, "/regles", value.regles),
      ...listed(at, "/sert", value.sert),
      ...value.erreurs.flatMap((error, i) =>
        error.regle === undefined ? [] : [at(`/erreurs/${i}/regle`, error.regle)],
      ),
    ];
  });
}

const nfrReferences = (spec: ParsedSpec): Reference[] =>
  spec.nfrs.flatMap(({ path, value }) =>
    listed(referencesFrom(path, value.id), "/liens", value.liens),
  );

/** Références du cahier technique qui ne désignent rien, avec la cible attendue d'après leur préfixe. */
function unknownReferences(spec: ParsedSpec, index: SpecIndex): [Reference, Target][] {
  const all = [...stackReferences(spec), ...operationReferences(spec), ...nfrReferences(spec)];
  return all.flatMap((reference) => {
    const target = TARGETS.find(({ prefix }) => reference.id.startsWith(prefix));
    return target === undefined || target.known(index).has(reference.id)
      ? []
      : [[reference, target]];
  });
}

const messageOf = ({ id }: Reference, { label }: Target): string => `${label} ${id} n'existe pas.`;

/** Règle 4 appliquée au cahier technique (TK-115) : C-, ADR-, F- et R- inconnus sont des erreurs `TECH_UNKNOWN_*`. */
export function checkTechnicalLinks(spec: ParsedSpec, index: SpecIndex, at: Collect): void {
  for (const [reference, target] of unknownReferences(spec, index)) {
    if (target.warns) continue;
    const emit = at(reference.path, reference.entityId);
    emit(target.code, reference.pointer, messageOf(reference, target));
  }
}

/** Avertissements (règle 7) : une exigence ou un choix technique cité et pas encore enregistré. */
export function checkTechnicalWarnings(spec: ParsedSpec, index: SpecIndex): Issue[] {
  return unknownReferences(spec, index)
    .filter(([, target]) => target.warns)
    .map(([reference, target]) => {
      const { path, pointer, entityId } = reference;
      const message = messageOf(reference, target);
      return ruleIssue(7, target.code, path, pointer, entityId, message);
    });
}
