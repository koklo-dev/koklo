import { featurePrioritySchema, featureStatusSchema } from "@koklo/contract";
import type { FeaturePriority, FeatureStatus } from "./feature-labels.ts";

export interface FeaturesUrlState {
  status?: FeatureStatus;
  priority?: FeaturePriority;
  /** Recherche (`?q=`), 1 à 200 caractères comme le contrat. */
  q?: string;
  /** Identifiant `F-nnn` de la fiche ouverte (`?sel=` ; l'ancien `?feature=` est lu, jamais écrit). */
  feature?: string;
  /** `?new=1` : formulaire de création (TK-48 / 48e). Exclusif de `edit` et de `feature`. */
  new?: true;
  /** `?edit=F-nnn` : formulaire de modification (TK-48 / 48e). Exclusif de `feature`. */
  edit?: string;
}

export type FeaturesUrlPatch = {
  [K in keyof FeaturesUrlState]?: FeaturesUrlState[K] | null;
};

const FEATURE_ID = /^F-\d{3,}$/;
const KEYS = ["status", "priority", "q", "edit"] as const;
/** Paramètre de la fiche ouverte ; `feature` est son ancien nom (liens déjà partagés). */
const SELECTED = "sel";
const LEGACY_SELECTED = "feature";
/** Longueur maximale de la recherche, celle du contrat (`LIST_QUERY_MAX_LENGTH`). */
export const QUERY_MAX_LENGTH = 200;

const isFeatureId = (value: string | null): value is string =>
  value !== null && FEATURE_ID.test(value);

/** Le formulaire (`edit` l'emporte sur `new`) ou, à défaut, la fiche : jamais deux panneaux. */
function readPanel(params: URLSearchParams): Pick<FeaturesUrlState, "new" | "edit" | "feature"> {
  const edit = params.get("edit");
  if (isFeatureId(edit)) return { edit };
  if (params.get("new") === "1") return { new: true };
  const selected = params.get(SELECTED);
  const feature = isFeatureId(selected) ? selected : params.get(LEGACY_SELECTED);
  return isFeatureId(feature) ? { feature } : {};
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
  return {
    ...(status.success ? { status: status.data } : {}),
    ...(priority.success ? { priority: priority.data } : {}),
    ...readQuery(params),
    ...readPanel(params),
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
  if (patch.new === null) params.delete("new");
  else if (patch.new) params.set("new", "1");
  const query = params.toString();
  return query ? `?${query}` : "";
}
