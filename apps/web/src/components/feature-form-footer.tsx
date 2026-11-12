import type { FeatureDelete } from "../lib/use-feature-delete.ts";
import type { FeatureFormModel } from "../lib/use-feature-form.ts";
import type { FeatureWrite } from "../lib/use-feature-submit.ts";

/** Suppression proposée dans le pied : seulement en modification, une fois la fonctionnalité lue. */
export interface DeleteEntry {
  del: FeatureDelete;
  specId: string;
  title: string;
  disabled: boolean;
  explained: boolean;
}

/** Entrée de la suppression, désactivée tant qu'une écriture suit son cours ; `null` hors modification. */
export function deleteEntry(
  mode: "create" | "edit",
  specId: string | undefined,
  model: FeatureFormModel,
  write: FeatureWrite,
): DeleteEntry | null {
  const baseline = model.state.baseline;
  if (mode !== "edit" || !specId || !baseline) return null;
  return {
    del: model.del,
    specId,
    title: baseline.title.trim(),
    disabled: write.busy || (model.mine && write.phase === "late"),
    explained: write.busy && !model.mine,
  };
}
