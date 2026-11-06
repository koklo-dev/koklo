import type { FeatureSummary } from "@koklo/contract";
import { LifecycleStatus, PriorityIndicator } from "@koklo/ui";
import { lifecycleStage, priorityLabel, priorityLevel } from "../lib/feature-labels.ts";

/**
 * Avancement (stade dérivé, H3) et priorité d'une fonctionnalité, partagés par la liste, la fiche et les
 * propositions du cadrage (DESIGN.md v2 §5.1) : la jauge et les barres doublent toujours un libellé.
 */
export function FeatureLifecycle({
  feature,
}: {
  feature: Pick<FeatureSummary, "status" | "criteriaCount">;
}) {
  return <LifecycleStatus stage={lifecycleStage(feature)} />;
}

export function FeaturePriority({ priority }: { priority: string }) {
  return <PriorityIndicator level={priorityLevel(priority)} label={priorityLabel(priority)} />;
}
