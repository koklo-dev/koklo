import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger, Icon } from "@koklo/ui";
import { useState } from "react";
import { AI_SETTINGS_LABELS as L } from "../lib/ai-settings-labels.ts";
import { BUTTON_CLASS } from "../lib/ai-settings-styles.ts";
import { FormField } from "./form-field.tsx";

/**
 * « Avancé » (replié) : modèle par défaut, facultatif. Champ texte ordinaire (il n'est pas secret) : sa valeur
 * survit au repli du bloc, contrairement à celle du champ de la clé qui n'est jamais retenue.
 */
export function AiCredentialAdvanced({
  model,
  onModel,
  error,
}: {
  model: string;
  onModel: (next: string) => void;
  error: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open || error !== undefined} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className={`group/advanced justify-start ${BUTTON_CLASS}`}
        >
          {L.advanced}
          <Icon
            name="chevron_right"
            size={18}
            className="motion-safe:transition-transform group-data-[state=open]/advanced:rotate-90"
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <FormField
          label={L.modelLabel}
          hint={L.modelHint}
          error={error}
          name="llm-model"
          autoComplete="off"
          spellCheck={false}
          value={model}
          onChange={(event) => onModel(event.target.value)}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}
