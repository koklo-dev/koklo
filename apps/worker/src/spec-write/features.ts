import type { Feature } from "@koklo/schema";
import { numberCriteria, type SubmittedCriterion } from "./criteria.ts";

/** Champs d'une opération `feature.create|update` (contrat 0.5.0), tous facultatifs ici. */
interface FeaturePayload {
  title?: string;
  status?: Feature["statut"];
  priority?: Feature["priorite"];
  description?: string;
  criteria?: SubmittedCriterion[];
  tables?: string[];
  endpoints?: string[];
  screens?: string[];
  roles?: string[];
  rules?: string[];
  nfr?: string[];
}

/** Correspondance champ du contrat -> clé de la feature pour les champs copiés tels quels. */
const COPIED = {
  title: "titre",
  status: "statut",
  priority: "priorite",
  description: "description",
  tables: "tables",
  endpoints: "endpoints",
  screens: "ecrans",
  roles: "roles",
  rules: "regles",
  nfr: "nfr",
} as const;

const EMPTY_FEATURE = {
  titre: "",
  statut: "brouillon",
  priorite: "should",
  tables: [],
  endpoints: [],
  ecrans: [],
  roles: [],
  regles: [],
  nfr: [],
  description: "",
  criteres: [],
} as const;

/** Applique les champs présents du payload (`criteria` renumérotés) sur la feature de départ. */
function overlay(base: Feature, payload: FeaturePayload): Feature {
  const next: Record<string, unknown> = { ...base };
  for (const [field, key] of Object.entries(COPIED)) {
    const value = payload[field as keyof typeof COPIED];
    if (value !== undefined) next[key] = value;
  }
  if (payload.criteria !== undefined) {
    next.criteres = numberCriteria(base.criteres, payload.criteria);
  }
  return next as Feature;
}

/** Feature neuve : défauts du contrat (brouillon, listes vides), critères numérotés dès AC-1. */
export const createdFeature = (id: string, payload: Readonly<Record<string, unknown>>): Feature =>
  overlay({ ...EMPTY_FEATURE, id } as unknown as Feature, payload as FeaturePayload);

/** Patch partiel : seuls les champs présents changent ; le nom du fichier ne change jamais. */
export const patchedFeature = (
  current: Feature,
  payload: Readonly<Record<string, unknown>>,
): Feature => overlay(current, payload as FeaturePayload);

export const isDesignLinked = (feature: Pick<Feature, "ecrans">): boolean =>
  feature.ecrans.length > 0;
