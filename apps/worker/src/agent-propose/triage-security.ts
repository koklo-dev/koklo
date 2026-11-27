import { type AgentProposalKind, slugOf } from "@koklo/domain";
import { PATTERNS } from "@koklo/schema";
import { recordsOf, stringsOf } from "../job-support.ts";
import { titleKey } from "./title-key.ts";

/**
 * Tri de la Sécurité (TK-117, B806) : références que le modèle peut viser, identifiant d'un élément repris (`specId`,
 * posé ici seulement). Une proposition citant une surface, un champ ou un rôle inconnu, un octroi ou un doublon est
 * écartée ; le schéma du type a déjà refusé toute conservation et tout identifiant dans le résumé. Pur, sans I/O.
 */
export interface SecurityRefs {
  /** Fonctionnalités et « api ». */
  readonly surfaces: ReadonlySet<string>;
  /** Champs du modèle `<table>.<champ>`. */
  readonly fields: ReadonlySet<string>;
  /** Champs sans entrée, retirés au fil des propositions gardées. */
  readonly unclassified: Set<string>;
  /** Rôle -> permissions qu'il porte. */
  readonly roles: ReadonlyMap<string, ReadonlySet<string>>;
  /** `<rôle> <permission> <texte>` des restrictions enregistrées. */
  readonly restrictions: ReadonlySet<string>;
  readonly ownershipRules: ReadonlySet<string>;
  /** Titre (clé de comparaison) -> menace enregistrée ; `open` : sans parade. */
  readonly threats: ReadonlyMap<string, { readonly specId: string; readonly open: boolean }>;
  readonly requirements: ReadonlyMap<string, { readonly id: string; readonly answered: boolean }>;
  /** Niveau ASVS effectif. */
  readonly level: number;
  /** `DOC-<slug>` des sections du dossier -> vrai si la section est vide. */
  readonly docSections: ReadonlyMap<string, boolean>;
}

type Payload = Record<string, unknown>;
export type SecurityVerdict =
  | { readonly payload: Payload; readonly zone: string }
  | "existing_section"
  | undefined;

export const OPEN_THREATS_ZONE = "Parades";
export const RIGHTS_ZONE = "Droits";
export const ASVS_ZONE = "Exigences";
export const SUMMARY_ZONE = "Résumé client";
export const DOSSIER_ZONE = "Document · dossier de sécurité";

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const allIn = (ids: readonly string[], known: ReadonlySet<string>): boolean =>
  ids.every((id) => known.has(id));

/** Liens vers un champ ou un rôle : connus seulement ; les autres genres avertissent à l'enregistrement. */
const linksKnown = (links: readonly string[], refs: SecurityRefs): boolean =>
  links.every((link) => {
    if (PATTERNS.dataField.test(link)) return refs.fields.has(link);
    return !link.startsWith("RL-") || refs.roles.has(link);
  });

/** Nouvelle menace, ou parades d'une menace ouverte du même titre (sa cible posée par le code). */
function threatVerdict(payload: Payload, refs: SecurityRefs): SecurityVerdict {
  const surfaces = stringsOf(payload.surfaces);
  if (!allIn(surfaces, refs.surfaces) || !linksKnown(stringsOf(payload.links), refs)) {
    return undefined;
  }
  const zone = surfaces[0] ?? OPEN_THREATS_ZONE;
  const existing = refs.threats.get(titleKey(text(payload.title)));
  if (existing === undefined) return { payload, zone };
  if (!existing.open || stringsOf(payload.measures).length === 0) return undefined;
  return { payload: { ...payload, specId: existing.specId }, zone: OPEN_THREATS_ZONE };
}

/** Champs encore sans entrée seulement ; chacun une fois par lancement. */
function sensitiveVerdict(payload: Payload, refs: SecurityRefs): SecurityVerdict {
  const fields = stringsOf(payload.fields);
  if (!allIn(fields, refs.unclassified)) return undefined;
  for (const field of fields) refs.unclassified.delete(field);
  return { payload, zone: (fields[0] ?? "").split(".")[0] ?? "" };
}

/** Une restriction ne vise qu'une permission portée par le rôle : jamais d'octroi (B794). */
function rightVerdict(payload: Payload, refs: SecurityRefs): SecurityVerdict {
  const found = { payload, zone: RIGHTS_ZONE };
  const rule = payload.ownershipRule;
  if (typeof rule === "string") {
    return refs.ownershipRules.has(titleKey(rule)) ? undefined : found;
  }
  const role = text(payload.role);
  const permission = text(payload.permission);
  const key = `${role} ${permission} ${titleKey(text(payload.restriction))}`;
  if (!refs.roles.get(role)?.has(permission) || refs.restrictions.has(key)) return undefined;
  return found;
}

/** Réponse à une exigence ouverte (cible posée par le code) ou exigence nouvelle, jusqu'au niveau effectif. */
function asvsVerdict(payload: Payload, refs: SecurityRefs): SecurityVerdict {
  const [requirement] = recordsOf([payload.requirement]);
  if (requirement === undefined) return { payload, zone: ASVS_ZONE };
  if ("specId" in requirement || Number(requirement.level) > refs.level) return undefined;
  const existing = refs.requirements.get(titleKey(text(requirement.title)));
  if (existing === undefined) return { payload, zone: ASVS_ZONE };
  if (existing.answered || requirement.answer === undefined) return undefined;
  const next = { ...payload, requirement: { ...requirement, specId: existing.id } };
  return { payload: next, zone: ASVS_ZONE };
}

/** Une section absente se propose, une section vide se rédige ; une section rédigée est laissée. */
function sectionVerdict(payload: Payload, refs: SecurityRefs): SecurityVerdict {
  const id = `DOC-${slugOf(text(payload.title), "section")}`;
  const empty = refs.docSections.get(id);
  if (empty === false) return "existing_section";
  const next = empty === undefined ? payload : { ...payload, specId: id };
  return { payload: next, zone: DOSSIER_ZONE };
}

const VERDICTS: Partial<
  Record<AgentProposalKind, (payload: Payload, refs: SecurityRefs) => SecurityVerdict>
> = {
  threat: threatVerdict,
  sensitive: sensitiveVerdict,
  right: rightVerdict,
  asvs: asvsVerdict,
  summary: (payload) => ({ payload, zone: SUMMARY_ZONE }),
  doc_section: sectionVerdict,
};

/** Une proposition valide de la Sécurité, vue par les références de la tête. */
export const securityVerdict = (
  kind: AgentProposalKind,
  payload: Payload,
  refs: SecurityRefs,
): SecurityVerdict => VERDICTS[kind]?.(payload, refs);
