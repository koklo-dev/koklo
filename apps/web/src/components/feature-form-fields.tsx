"use client";

import { featurePrioritySchema, featureStatusSchema } from "@koklo/contract";
import {
  Button,
  Icon,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@koklo/ui";
import type { ReactNode } from "react";
import { type FeatureFormValues, type FieldKey, TITLE_MAX } from "../lib/feature-form.ts";
import { fieldId } from "../lib/feature-form-ids.ts";
import { priorityLabel, statusLabel } from "../lib/feature-labels.ts";
import { describeCurrentValue } from "../lib/feature-rebase.ts";
import type { FeatureFormModel } from "../lib/use-feature-form.ts";

export const messageOf = (model: FeatureFormModel, field: string): string | undefined =>
  model.issues.find((issue) => issue.field === field)?.message;

/** Message d'erreur d'un champ : icône et texte, relié au champ par `aria-describedby`. */
export function FieldMessage({ id, text }: { id: string; text: string }) {
  return (
    <p id={id} className="flex items-start gap-1 text-[13px] text-destructive">
      <Icon name="warning" size={16} className="mt-0.5" />
      <span>{text}</span>
    </p>
  );
}

interface ControlProps {
  id: string;
  "aria-describedby": string | undefined;
  "aria-invalid": true | undefined;
}
interface ShellProps {
  field: FieldKey;
  label: string;
  model: FeatureFormModel;
  /** Aide permanente sous le champ. */
  hint?: ReactNode;
  hintId?: string;
  children: (control: ControlProps) => ReactNode;
}

/** « Valeur actuelle dans la spec : … » pour un champ modifié des deux côtés (S-feature-form §5.8). */
function CurrentValue({ field, model }: { field: FieldKey; model: FeatureFormModel }) {
  const { current, conflicts } = model.state;
  if (!current || !conflicts.includes(field)) return null;
  return (
    <div className="flex flex-col items-start gap-1.5 rounded-md bg-muted p-2 text-[13px]">
      <p>{`Valeur actuelle dans la spec : ${describeCurrentValue(field, current)}`}</p>
      <Button
        type="button"
        variant="outline"
        className="h-11 md:h-9"
        onClick={() => model.takeCurrent(field)}
      >
        Reprendre la valeur actuelle
      </Button>
    </div>
  );
}

/** Libellé visible lié, aide, erreur et valeur actuelle d'un champ du formulaire. */
export function FieldShell({ field, label, model, hint, hintId, children }: ShellProps) {
  const id = fieldId(field);
  const message = messageOf(model, field);
  const invalid = Boolean(message) || model.state.serverFields.includes(field);
  const describedBy = [message ? `${id}-error` : null, hint ? hintId : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children({
        id,
        "aria-describedby": describedBy || undefined,
        "aria-invalid": invalid ? true : undefined,
      })}
      {message ? <FieldMessage id={`${id}-error`} text={message} /> : null}
      {hint}
      <CurrentValue field={field} model={model} />
    </div>
  );
}

const Hint = ({ id, children }: { id: string; children: ReactNode }) => (
  <p id={id} className="text-[13px] text-muted-foreground">
    {children}
  </p>
);

const PRIORITIES = featurePrioritySchema.options.map((value) => ({
  value,
  label: priorityLabel(value),
}));
const STATUSES = featureStatusSchema.options.map((value) => ({
  value,
  label: statusLabel(value),
}));

interface FieldsProps {
  model: FeatureFormModel;
  readOnly: boolean;
}

function EnumSelect<V extends string>(props: {
  control: ControlProps;
  value: string;
  options: { value: V; label: string }[];
  placeholder?: string;
  disabled: boolean;
  onChange: (value: V) => void;
  onBlur: () => void;
}) {
  const { control, value, options, placeholder, disabled, onChange, onBlur } = props;
  return (
    <Select value={value} disabled={disabled} onValueChange={(next) => onChange(next as V)}>
      <SelectTrigger {...control} className="h-11 md:h-9" onBlur={onBlur}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Titre, priorité et statut (section « Général »). */
export function GeneralFields({ model, readOnly }: FieldsProps) {
  const { values } = model.state;
  const length = values.title.length;
  const counterId = `${fieldId("title")}-count`;
  return (
    <section aria-labelledby="feature-form-general" className="flex flex-col gap-4">
      <h3 id="feature-form-general" className="text-[13px] font-semibold text-muted-foreground">
        Général
      </h3>
      <FieldShell
        field="title"
        label="Titre (obligatoire)"
        model={model}
        hintId={counterId}
        hint={
          length >= 180 ? (
            <p id={counterId} aria-live="polite" className="text-[13px] text-muted-foreground">
              {`${length} / ${TITLE_MAX}`}
            </p>
          ) : null
        }
      >
        {(control) => (
          <Input
            {...control}
            className="h-11 md:h-9"
            value={values.title}
            readOnly={readOnly}
            onChange={(event) => model.setValues({ title: event.target.value })}
            onBlur={() => model.blur("title")}
          />
        )}
      </FieldShell>
      <FieldShell field="priority" label="Priorité (obligatoire)" model={model}>
        {(control) => (
          <EnumSelect
            control={control}
            value={values.priority}
            options={PRIORITIES}
            placeholder="Choisir une priorité"
            disabled={readOnly}
            onChange={(priority) => model.setValues({ priority })}
            onBlur={() => model.blur("priority")}
          />
        )}
      </FieldShell>
      <FieldShell field="status" label="Statut" model={model}>
        {(control) => (
          <EnumSelect
            control={control}
            value={values.status}
            options={STATUSES}
            disabled={readOnly}
            onChange={(status) => model.setValues({ status })}
            onBlur={() => model.blur("status")}
          />
        )}
      </FieldShell>
    </section>
  );
}

/** Description en texte brut : les retours à la ligne sont conservés. */
export function DescriptionField({ model, readOnly }: FieldsProps) {
  const hintId = `${fieldId("description")}-hint`;
  return (
    <section aria-label="Description" className="flex flex-col gap-4">
      <FieldShell
        field="description"
        label="Description"
        model={model}
        hintId={hintId}
        hint={<Hint id={hintId}>Texte brut : les retours à la ligne sont conservés.</Hint>}
      >
        {(control) => (
          <Textarea
            {...control}
            rows={4}
            value={model.state.values.description}
            readOnly={readOnly}
            onChange={(event) => model.setValues({ description: event.target.value })}
          />
        )}
      </FieldShell>
    </section>
  );
}

export type { FeatureFormValues };
