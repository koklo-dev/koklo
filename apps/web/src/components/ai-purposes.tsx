import { Card, CardHeader, CardTitle, Icon } from "@koklo/ui";
import {
  AI_SETTINGS_LABELS as L,
  USAGE_LABELS,
  USAGE_PURPOSES,
  USAGES,
} from "../lib/ai-settings-labels.ts";

/** « À quoi servent ces clés » : les usages de l'IA (coche) et ce qu'elle ne fait jamais (interdit). Texte fixe. */
export function AiPurposes() {
  return (
    <Card role="region" aria-label={L.purposesTitle} className="flex flex-col gap-2.5">
      <CardHeader>
        <CardTitle>{L.purposesTitle}</CardTitle>
      </CardHeader>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-meta leading-snug">
        {USAGES.map((usage) => (
          <li key={usage} className="flex gap-2.5">
            <Icon name="check" size={18} tone="success" className="mt-px" />
            <span>
              <span className="font-medium">{USAGE_LABELS[usage]}</span>
              <span className="text-muted-foreground"> : {USAGE_PURPOSES[usage]}</span>
            </span>
          </li>
        ))}
        <li className="flex gap-2.5">
          <Icon name="block" size={18} tone="danger" className="mt-px" />
          <span>{L.purposeNever}</span>
        </li>
      </ul>
    </Card>
  );
}
