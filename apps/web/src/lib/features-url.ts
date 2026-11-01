import { featurePrioritySchema, featureStatusSchema } from "@koklo/contract";
import type { FeaturePriority, FeatureStatus } from "./feature-labels.ts";

export interface FeaturesUrlState {
  status?: FeatureStatus;
  priority?: FeaturePriority;
  /** Identifiant `F-nnn` de la fiche ouverte. */
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
const KEYS = ["status", "priority", "feature", "edit"] as const;

const isFeatureId = (value: string | null): value is string =>
  value !== null && FEATURE_ID.test(value);

/** Le formulaire (`edit` l'emporte sur `new`) ou, à défaut, la fiche : jamais deux panneaux. */
function readPanel(params: URLSearchParams): Pick<FeaturesUrlState, "new" | "edit" | "feature"> {
  const edit = params.get("edit");
  if (isFeatureId(edit)) return { edit };
  if (params.get("new") === "1") return { new: true };
  const feature = params.get("feature");
  return isFeatureId(feature) ? { feature } : {};
}

/** Lit les paramètres de l'écran dans une query string ; les valeurs inconnues sont ignorées. */
export function readFeaturesUrl(search: string): FeaturesUrlState {
  const params = new URLSearchParams(search);
  const status = featureStatusSchema.safeParse(params.get("status"));
  const priority = featurePrioritySchema.safeParse(params.get("priority"));
  return {
    ...(status.success ? { status: status.data } : {}),
    ...(priority.success ? { priority: priority.data } : {}),
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
  if (patch.new === null) params.delete("new");
  else if (patch.new) params.set("new", "1");
  const query = params.toString();
  return query ? `?${query}` : "";
}
