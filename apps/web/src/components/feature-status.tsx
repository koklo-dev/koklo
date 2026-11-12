import type { FeatureSummary } from "@koklo/contract";
import { LifecycleStatus, PriorityIndicator } from "@koklo/ui";
import { lifecycleStage, priorityLabel, priorityLevel } from "../lib/feature-labels.ts";

/**
 * Avancement (stade dérivé, H3) et priorité d'une fonctionnalité, partagés par la liste, la fiche et les
 * propositions du cadrage (DESIGN.md v2 §5.1) : la jauge et les barres doublent toujours un libellé.
 */
export function FeatureLifecycle({
  feature,
  className,
}: {
  feature: Pick<FeatureSummary, "status" | "criteriaCount">;
  className?: string;
}) {
  return <LifecycleStatus stage={lifecycleStage(feature)} {...(className ? { className } : {})} />;
}

/** `barsOnly` : la ligne de liste n'affiche que les barres (planche 12), le libellé devient leur nom accessible. */
export function FeaturePriority({
  priority,
  barsOnly = false,
}: {
  priority: string;
  barsOnly?: boolean;
}) {
  return (
    <PriorityIndicator
      level={priorityLevel(priority)}
      label={priorityLabel(priority)}
      barsOnly={barsOnly}
    />
  );
}
