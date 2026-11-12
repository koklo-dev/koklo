import {
  featurePrioritySchema,
  featureStatusSchema,
  featureValidationSchema,
} from "@koklo/contract";
import type { FeaturePriority, FeatureStatus, FeatureValidation } from "./feature-labels.ts";
import { type FeaturesTab, readFeaturesTab, TAB_ID } from "./features-tab.ts";

/** Types de règle du filtre `?type=` (légende de l'onglet Règles métier). */
export const RULE_TYPES = ["contrainte", "calcul", "workflow"] as const;
export type RuleTypeFilter = (typeof RULE_TYPES)[number];

export interface FeaturesUrlState {
  status?: FeatureStatus;
  priority?: FeaturePriority;
  /** Validation du client (`?validation=`) : validated, to_validate ou to_revise. */
  validation?: FeatureValidation;
  /** Recherche (`?q=`), 1 à 200 caractères comme le contrat. */
  q?: string;
  /** Type de règle (`?type=`), onglet Règles métier seulement. */
  type?: RuleTypeFilter;
  /** Identifiant de l'élément choisi (`?sel=` ; l'ancien `?feature=` est lu, jamais écrit) : `F-nnn`, `R-nnn`, `RL-…` ou `P-…` selon l'onglet. */
  feature?: string;
  /** `?new=1` : formulaire de création (TK-48 / 48e). Exclusif de `edit` et de `feature`. */
  new?: true;
  /** `?edit=<identifiant>` : formulaire de modification (TK-48 / 48e). Exclusif de `feature`. */
  edit?: string;
  /** `?view=review` : relecture des propositions de l'agent (TK-99b). */
  review?: true;
}

export type FeaturesUrlPatch = {
  [K in keyof FeaturesUrlState]?: FeaturesUrlState[K] | null;
};

const KEYS = ["status", "priority", "validation", "q", "edit", "type"] as const;
/** Paramètre de la fiche ouverte ; `feature` est son ancien nom (liens déjà partagés). */
const SELECTED = "sel";
const LEGACY_SELECTED = "feature";
/** Longueur maximale de la recherche, celle du contrat (`LIST_QUERY_MAX_LENGTH`). */
export const QUERY_MAX_LENGTH = 200;

/** Le formulaire (`edit` l'emporte sur `new`) ou, à défaut, la fiche : jamais deux panneaux. */
function readPanel(
  params: URLSearchParams,
  tab: FeaturesTab,
): Pick<FeaturesUrlState, "new" | "edit" | "feature"> {
  const isId = (value: string | null): value is string => value !== null && TAB_ID[tab].test(value);
  const edit = params.get("edit");
  if (isId(edit)) return { edit };
  if (params.get("new") === "1") return { new: true };
  const selected = params.get(SELECTED);
  const feature = isId(selected) ? selected : params.get(LEGACY_SELECTED);
  return isId(feature) ? { feature } : {};
}

function readQuery(params: URLSearchParams): Pick<FeaturesUrlState, "q"> {
  const q = (params.get("q") ?? "").trim().slice(0, QUERY_MAX_LENGTH);
  return q ? { q } : {};
}

/** Lit les paramètres de l'écran dans une query string ; les valeurs inconnues sont ignorées. */
export function readFeaturesUrl(search: string): FeaturesUrlState {
  const params = new URLSearchParams(search);
  const status = featureStatusSchema.safeParse(params.get("status"));
  const priority = featurePrioritySchema.safeParse(params.get("priority"));
  const validation = featureValidationSchema.safeParse(params.get("validation"));
  const type = RULE_TYPES.find((candidate) => candidate === params.get("type"));
  return {
    ...(params.get("view") === "review" ? { review: true as const } : {}),
    ...(status.success ? { status: status.data } : {}),
    ...(priority.success ? { priority: priority.data } : {}),
    ...(validation.success ? { validation: validation.data } : {}),
    ...(type ? { type } : {}),
    ...readQuery(params),
    ...readPanel(params, readFeaturesTab(search)),
  };
}

/** Applique `patch` (null efface) à `search` et rend la nouvelle query string : "" ou "?a=b". */
export function withFeaturesUrl(search: string, patch: FeaturesUrlPatch): string {
  const params = new URLSearchParams(search);
  for (const key of KEYS) {
    const value = patch[key];
    if (value === null) params.delete(key);
    else if (value !== undefined) params.set(key, value);
  }
  if (patch.feature !== undefined) {
    params.delete(LEGACY_SELECTED);
    if (patch.feature === null) params.delete(SELECTED);
    else params.set(SELECTED, patch.feature);
  }
  if (patch.review === null) params.delete("view");
  else if (patch.review) params.set("view", "review");
  if (patch.new === null) params.delete("new");
  else if (patch.new) params.set("new", "1");
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Met `tab=<onglet>` en tête de la requête (l'écran vit sous `?tab=`) ; le reste est conservé tel quel. */
export function withFeaturesTab(search: string, tab: FeaturesTab = "features"): string {
  const params = new URLSearchParams(search);
  params.delete("tab");
  const rest = params.toString();
  return `?tab=${tab}${rest ? `&${rest}` : ""}`;
}
