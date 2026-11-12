"use client";

import { featurePrioritySchema, featureStatusSchema } from "@koklo/contract";
import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Icon,
  Input,
  RadioPill,
  RadioPillGroup,
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
    <p id={id} className="flex items-start gap-1 text-meta text-destructive">
      <Icon name="warning" size={16} className="mt-0.5" />
      <span>{text}</span>
    </p>
  );
}

interface ControlProps {
  id: string;
  "aria-describedby": string | undefined;
  "aria-invalid": true | undefined;
  /** Identifiant du libellé, pour nommer un groupe de pastilles. */
  labelId: string;
}
interface ShellProps {
  field: FieldKey;
  label: string;
  model: FeatureFormModel;
  /** « * » après le libellé (champ obligatoire). */
  required?: boolean;
  /** « (facultatif) » après le libellé. */
  optional?: boolean;
  /** Rempli par l'agent : filet de 3 px et mention « proposé par l'agent ». */
  agentFilled?: boolean;
  /** Le libellé désigne un contrôle étiqueté (`false` pour un groupe de pastilles, nommé par `aria-labelledby`). */
  labelFor?: boolean;
  /** Aide permanente sous le champ. */
  hint?: ReactNode;
  hintId?: string;
  children: (control: ControlProps) => ReactNode;
}

/** « Valeur actuelle dans la spec : … » pour un champ modifié des deux côtés (S-feature-form §5.8). */
export function CurrentValue({ field, model }: { field: FieldKey; model: FeatureFormModel }) {
  const { current, conflicts } = model.state;
  if (!current || !conflicts.includes(field)) return null;
  return (
    <div className="flex flex-col items-start gap-1.5 rounded-md bg-muted p-2 text-meta">
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

/** Libellé visible lié, aide, erreur et valeur actuelle d'un champ du formulaire (maquette 16 l.82-93). */
export function FieldShell(props: ShellProps) {
  const { field, label, model, hint, hintId, children } = props;
  const id = fieldId(field);
  const message = messageOf(model, field);
  const invalid = Boolean(message) || model.state.serverFields.includes(field);
  const describedBy = [message ? `${id}-error` : null, hint ? hintId : null]
    .filter(Boolean)
    .join(" ");
  const labelId = `${id}-label`;
  return (
    <Field agentFilled={props.agentFilled ?? false} className="gap-1.5">
      <FieldLabel
        id={labelId}
        {...(props.labelFor === false ? {} : { htmlFor: id })}
        required={props.required ?? false}
        optional={props.optional ?? false}
      >
        {label}
      </FieldLabel>
      {children({
        id,
        "aria-describedby": describedBy || undefined,
        "aria-invalid": invalid ? true : undefined,
        labelId,
      })}
      {message ? <FieldError id={`${id}-error`}>{message}</FieldError> : null}
      {hint}
      <CurrentValue field={field} model={model} />
    </Field>
  );
}

/** Aide sous un champ : 12 px, `--muted-foreground`. */
export const Hint = ({ id, children }: { id: string; children: ReactNode }) => (
  <FieldDescription id={id}>{children}</FieldDescription>
);

const PRIORITIES = featurePrioritySchema.options.map((value) => ({
  value,
  label: priorityLabel(value),
}));
const STATUSES = featureStatusSchema.options.map((value) => ({
  value,
  label: statusLabel(value),
}));

export interface FieldsProps {
  model: FeatureFormModel;
  readOnly: boolean;
  /** Champs que l'agent a remplis (marqués tant qu'ils ne sont pas vides). */
  agentFilled?: (key: "title" | "priority" | "description") => boolean;
}

/** Choix d'une valeur parmi quelques-unes, en pastilles de 32 px (maquette 16 l.88). */
function PillChoice<V extends string>(props: {
  control: ControlProps;
  value: string;
  options: { value: V; label: string }[];
  disabled: boolean;
  onChange: (value: V) => void;
  onBlur: () => void;
}) {
  const { control, value, options, disabled, onChange, onBlur } = props;
  const { labelId, id, ...aria } = control;
  return (
    <RadioPillGroup
      {...aria}
      aria-labelledby={labelId}
      value={value}
      disabled={disabled}
      onValueChange={(next) => onChange(next as V)}
      onBlur={onBlur}
    >
      {options.map((option, index) => (
        // La première pastille porte l'identifiant du champ : c'est elle qui reçoit le focus d'une erreur.
        <RadioPill
          key={option.value}
          value={option.value}
          {...(index === 0 ? { id } : {})}
          aria-invalid={aria["aria-invalid"]}
        >
          {option.label}
        </RadioPill>
      ))}
    </RadioPillGroup>
  );
}

/** Titre : compteur de caractères dès 180. */
function TitleField({ model, readOnly, agentFilled }: FieldsProps) {
  const { title } = model.state.values;
  const counterId = `${fieldId("title")}-count`;
  return (
    <FieldShell
      field="title"
      label="Titre"
      required
      agentFilled={agentFilled?.("title") === true && title.trim() !== ""}
      model={model}
      hintId={counterId}
      hint={
        title.length >= 180 ? (
          <p id={counterId} aria-live="polite" className="text-meta text-muted-foreground">
            {`${title.length} / ${TITLE_MAX}`}
          </p>
        ) : null
      }
    >
      {({ labelId: _label, ...control }) => (
        <Input
          {...control}
          className="max-md:h-11"
          value={title}
          readOnly={readOnly}
          onChange={(event) => model.setValues({ title: event.target.value })}
          onBlur={() => model.blur("title")}
        />
      )}
    </FieldShell>
  );
}

/** Titre, priorité et statut. */
export function GeneralFields({ model, readOnly, agentFilled }: FieldsProps) {
  const { values } = model.state;
  return (
    <>
      <TitleField model={model} readOnly={readOnly} {...(agentFilled ? { agentFilled } : {})} />
      <FieldShell
        field="priority"
        label="Priorité"
        required
        labelFor={false}
        agentFilled={agentFilled?.("priority") === true && values.priority !== ""}
        model={model}
      >
        {(control) => (
          <PillChoice
            control={control}
            value={values.priority}
            options={PRIORITIES}
            disabled={readOnly}
            onChange={(priority) => model.setValues({ priority })}
            onBlur={() => model.blur("priority")}
          />
        )}
      </FieldShell>
      <FieldShell field="status" label="Statut" optional labelFor={false} model={model}>
        {(control) => (
          <PillChoice
            control={control}
            value={values.status}
            options={STATUSES}
            disabled={readOnly}
            onChange={(status) => model.setValues({ status })}
            onBlur={() => model.blur("status")}
          />
        )}
      </FieldShell>
    </>
  );
}

/** Description en texte brut : les retours à la ligne sont conservés. */
export function DescriptionField({ model, readOnly, agentFilled }: FieldsProps) {
  const hintId = `${fieldId("description")}-hint`;
  const { description } = model.state.values;
  return (
    <FieldShell
      field="description"
      label="Description"
      agentFilled={Boolean(agentFilled?.("description")) && description.trim() !== ""}
      model={model}
      hintId={hintId}
      hint={<Hint id={hintId}>Ce que l'utilisateur peut faire, en une ou deux phrases.</Hint>}
    >
      {({ labelId: _label, ...control }) => (
        <Textarea
          {...control}
          rows={3}
          className="resize-y"
          value={description}
          readOnly={readOnly}
          onChange={(event) => model.setValues({ description: event.target.value })}
        />
      )}
    </FieldShell>
  );
}

export type { FeatureFormValues };
