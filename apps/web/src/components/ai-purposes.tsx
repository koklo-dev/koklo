import { Icon } from "@koklo/ui";
import {
  AI_SETTINGS_LABELS as L,
  USAGE_LABELS,
  USAGE_PURPOSES,
  USAGES,
} from "../lib/ai-settings-labels.ts";
import { AiSectionCard } from "./ai-section-card.tsx";

/** « À quoi servent ces clés » : les usages de l'IA (coche) et ce qu'elle ne fait jamais (interdit). Texte fixe. */
export function AiPurposes() {
  return (
    <AiSectionCard title={L.purposesTitle}>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-sm leading-snug">
        {USAGES.map((usage) => (
          <li key={usage} className="flex gap-2.5">
            <Icon name="check" size={18} className="mt-px shrink-0" />
            <span>
              <span className="font-medium">{USAGE_LABELS[usage]}</span>
              <span className="text-muted-foreground"> : {USAGE_PURPOSES[usage]}</span>
            </span>
          </li>
        ))}
        <li className="flex gap-2.5">
          <Icon name="block" size={18} className="mt-px shrink-0" />
          <span>{L.purposeNever}</span>
        </li>
      </ul>
    </AiSectionCard>
  );
}
