import { type AgentProposalKind, slugOf } from "@koklo/domain";
import { recordsOf, stringsOf } from "../job-support.ts";
import { titleKey } from "./title-key.ts";

/**
 * Tri du cahier technique (TK-115, B727, B734) : références que le modèle peut viser, identifiant d'un élément repris
 * (`specId`, posé ici seulement, selon le mode) et estimations marquées « ≈ ». Pur, sans I/O.
 */
export interface TechnicalRefs {
  /** `complete` (le manquant), `compare` (choix à trancher), `nfr` (exigences existantes) ou `all`. */
  readonly mode: string;
  readonly components: ReadonlySet<string>;
  readonly features: ReadonlySet<string>;
  readonly rules: ReadonlySet<string>;
  readonly decisions: ReadonlySet<string>;
  /** Titre (clé de comparaison) -> `NFR-` des exigences enregistrées. */
  readonly requirements: ReadonlyMap<string, string>;
  /** Exigences citables : enregistrées ou citées par le cahier fonctionnel. */
  readonly knownRequirements: ReadonlySet<string>;
  readonly stacks: ReadonlyMap<string, { readonly role: string; readonly open: boolean }>;
  readonly operations: ReadonlySet<string>;
  readonly environments: ReadonlySet<string>;
  /** `DOC-<slug>` des sections du cahier -> vrai si la section est vide. */
  readonly docSections: ReadonlyMap<string, boolean>;
}

type Payload = Record<string, unknown>;

/** Une proposition gardée avec sa zone, une section déjà rédigée (comptée à part), ou `undefined` : écartée. */
export type TechnicalVerdict =
  | { readonly payload: Payload; readonly zone: string }
  | "existing_section"
  | undefined;

export const STACK_ZONE = "Stack";
export const REQUIREMENTS_ZONE = "Exigences";
export const ENVIRONMENTS_ZONE = "Environnements";
export const DOCUMENT_ZONE = "Document · cahier technique";
/** Longueur maximale de la zone d'une opération dans son fichier. */
const OPERATION_ZONE_MAX = 80;
const ESTIMATE = "≈";
/** Valeur chiffrée en prix ou en performance : `€ $ ms s % /mois`. */
const MEASURED = /[€$]\s*\d|\d\s*(?:€|\$|%|ms(?![a-zà-ÿ])|s(?![a-zà-ÿ])|\/\s*mois)/i;
const CRITERION_VALUE_MAX = 200;

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const allIn = (ids: readonly string[], known: ReadonlySet<string>): boolean =>
  ids.every((id) => known.has(id));

/** Les modes qui reprennent tout élément existant : sans identifiant trouvé, ils n'en créent pas. */
const UPDATE_ONLY: readonly string[] = ["compare", "nfr"];

/** `specId` à poser (`null` : création), ou `undefined` : le mode ne demande pas cette proposition. */
function targetOf(mode: string, existing: string | undefined): string | null | undefined {
  if (existing === undefined) return UPDATE_ONLY.includes(mode) ? undefined : null;
  return mode === "complete" ? undefined : existing;
}

const verdict = (
  payload: Payload,
  zone: string,
  specId: string | null | undefined,
): TechnicalVerdict => {
  if (specId === undefined) return undefined;
  return { payload: specId === null ? payload : { ...payload, specId }, zone };
};

/** Prix et performances proposés par l'agent : préfixés « ≈ » et marqués estimés (B734). */
function withEstimates(criterion: Payload): Payload {
  const values = stringsOf(criterion.values);
  if (!values.some((value) => MEASURED.test(value))) return criterion;
  const marked = values.map((value) =>
    MEASURED.test(value) && !value.startsWith(ESTIMATE)
      ? `${ESTIMATE} ${value}`.slice(0, CRITERION_VALUE_MAX)
      : value,
  );
  return { label: criterion.label, estimate: true, values: marked };
}

function existingStack(payload: Payload, refs: TechnicalRefs): string | undefined {
  const id = `ST-${slugOf(text(payload.role), "choix")}`;
  if (refs.stacks.has(id)) return id;
  const role = titleKey(text(payload.role));
  return [...refs.stacks].find(([, stack]) => titleKey(stack.role) === role)?.[0];
}

function stackVerdict(payload: Payload, refs: TechnicalRefs): TechnicalVerdict {
  const known =
    allIn(stringsOf(payload.components), refs.components) &&
    allIn(stringsOf(payload.decisions), refs.decisions);
  const existing = existingStack(payload, refs);
  // Comparer ne reprend que les choix à trancher.
  if (!known || (refs.mode === "compare" && !refs.stacks.get(existing ?? "")?.open)) {
    return undefined;
  }
  const next = {
    ...payload,
    criteria: recordsOf(payload.criteria).map(withEstimates),
    requirements: stringsOf(payload.requirements).filter((id) => refs.knownRequirements.has(id)),
  };
  return verdict(next, STACK_ZONE, targetOf(refs.mode, existing));
}

/** Une erreur qui cite une règle inconnue garde son code et sa condition, sans la règle. */
const knownErrorRules = (errors: unknown, rules: ReadonlySet<string>) =>
  recordsOf(errors).map((error) => {
    const { rule, ...rest } = error;
    return typeof rule === "string" && rules.has(rule) ? error : rest;
  });

function operationVerdict(payload: Payload, refs: TechnicalRefs): TechnicalVerdict {
  const zone = text(payload.zone);
  const known =
    refs.components.has(text(payload.component)) &&
    allIn(stringsOf(payload.rules), refs.rules) &&
    allIn(stringsOf(payload.features), refs.features);
  if (!known || zone.length > OPERATION_ZONE_MAX) return undefined;
  const name = text(payload.name);
  const existing = refs.operations.has(name) ? name : undefined;
  const next = { ...payload, errors: knownErrorRules(payload.errors, refs.rules) };
  return verdict(next, zone, targetOf(refs.mode, existing));
}

/** Un lien vers un choix pas encore enregistré avertit seulement (B740) ; les autres doivent être connus. */
function requirementVerdict(payload: Payload, refs: TechnicalRefs): TechnicalVerdict {
  const known = new Set([...refs.components, ...refs.decisions, ...refs.rules]);
  const links = stringsOf(payload.links).filter((id) => !id.startsWith("ST-"));
  if (!allIn(links, known)) return undefined;
  const existing = refs.requirements.get(titleKey(text(payload.title)));
  return verdict(payload, REQUIREMENTS_ZONE, targetOf(refs.mode, existing));
}

function environmentVerdict(payload: Payload, refs: TechnicalRefs): TechnicalVerdict {
  const id = `ENV-${slugOf(text(payload.name), "environnement")}`;
  const existing = refs.environments.has(id) ? id : undefined;
  return verdict(payload, ENVIRONMENTS_ZONE, targetOf(refs.mode, existing));
}

/** Une section vide se rédige (mise à jour) ; une section rédigée n'est reprise que par « tout reproposer ». */
function sectionVerdict(payload: Payload, refs: TechnicalRefs): TechnicalVerdict {
  const id = `DOC-${slugOf(text(payload.title), "section")}`;
  const empty = refs.docSections.get(id);
  if (empty === undefined) return verdict(payload, DOCUMENT_ZONE, null);
  if (!empty && refs.mode !== "all") return "existing_section";
  return verdict(payload, DOCUMENT_ZONE, id);
}

const VERDICTS: Partial<
  Record<AgentProposalKind, (payload: Payload, refs: TechnicalRefs) => TechnicalVerdict>
> = {
  stack: stackVerdict,
  op: operationVerdict,
  nfr: requirementVerdict,
  env: environmentVerdict,
  doc_section: sectionVerdict,
};

/** Une proposition valide du cahier technique, vue par les références de la tête. */
export const technicalVerdict = (
  kind: AgentProposalKind,
  payload: Payload,
  refs: TechnicalRefs,
): TechnicalVerdict => VERDICTS[kind]?.(payload, refs);
