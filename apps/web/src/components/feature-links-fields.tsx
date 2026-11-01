"use client";

import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Icon,
  Textarea,
} from "@koklo/ui";
import { LINK_FIELDS, type LinkField, linkExample } from "../lib/feature-form.ts";
import { FIELD_LABELS, fieldId } from "../lib/feature-form-ids.ts";
import type { FeatureFormModel } from "../lib/use-feature-form.ts";
import { FieldShell } from "./feature-form-fields.tsx";

const DESIGNER_HELP =
  "En tant que designer, vous pouvez enregistrer une fonctionnalité seulement si elle est liée à au moins un écran.";

function LinkInput({
  field,
  model,
  readOnly,
  designer,
}: {
  field: LinkField;
  model: FeatureFormModel;
  readOnly: boolean;
  designer: boolean;
}) {
  const hintId = `${fieldId(field)}-hint`;
  const help = designer && field === "screens";
  return (
    <FieldShell
      field={field}
      label={FIELD_LABELS[field]}
      model={model}
      hintId={hintId}
      hint={
        <div id={hintId} className="flex flex-col gap-1 text-[13px] text-muted-foreground">
          <p>
            Exemple : <span className="font-mono">{linkExample(field)}</span>
          </p>
          {help ? <p>{DESIGNER_HELP}</p> : null}
        </div>
      }
    >
      {(control) => (
        <Textarea
          {...control}
          rows={3}
          className="font-mono"
          value={model.state.values[field]}
          readOnly={readOnly}
          onChange={(event) => model.setValues({ [field]: event.target.value })}
          onBlur={() => model.blur(field)}
        />
      )}
    </FieldShell>
  );
}

/** « Éléments liés » : un champ multiligne par type, un identifiant par ligne (S-feature-form §3.2). */
export function LinksFields({
  model,
  readOnly,
  designer,
}: {
  model: FeatureFormModel;
  readOnly: boolean;
  designer: boolean;
}) {
  const forced = model.issues.some((issue) => LINK_FIELDS.some((field) => issue.field === field));
  const open = model.state.linksOpen || forced;
  return (
    <Collapsible open={open} onOpenChange={model.setLinksOpen} className="flex flex-col gap-3">
      <CollapsibleTrigger asChild>
        <Button type="button" variant="ghost" className="h-11 justify-start px-2 md:h-9">
          <Icon name="link" size={20} />
          Éléments liés
          <Icon
            name={open ? "keyboard_arrow_up" : "keyboard_arrow_down"}
            size={16}
            className="ml-auto"
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-4 motion-reduce:transition-none">
        <p className="text-[13px] text-muted-foreground">
          Un identifiant par ligne ; les lignes vides sont ignorées.
        </p>
        {LINK_FIELDS.map((field) => (
          <LinkInput
            key={field}
            field={field}
            model={model}
            readOnly={readOnly}
            designer={designer}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
