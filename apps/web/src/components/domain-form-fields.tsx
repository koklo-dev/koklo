"use client";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  RadioPill,
  RadioPillGroup,
  TagInput,
  Textarea,
} from "@koklo/ui";
import type { ReactNode } from "react";
import type { FormIssue } from "../lib/feature-form.ts";
import { useRefsSearch } from "../lib/use-refs-search.ts";

export const domainFieldId = (field: string): string => `domain-form-${field}`;

interface ShellProps {
  field: string;
  label: string;
  issues: FormIssue[];
  required?: boolean;
  optional?: boolean;
  hint?: ReactNode;
  /** Un groupe de pastilles est nommé par `aria-labelledby`, pas par un `label for`. */
  labelFor?: boolean;
  children: (control: {
    id: string;
    "aria-describedby": string | undefined;
    "aria-invalid": true | undefined;
    labelId: string;
  }) => ReactNode;
}

/** Libellé visible lié, aide et erreur d'un champ des formulaires Règle, Rôle et Parcours (maquette 10 l.352-359). */
export function DomainField({
  field,
  label,
  issues,
  required,
  optional,
  hint,
  labelFor = true,
  children,
}: ShellProps) {
  const id = domainFieldId(field);
  const message = issues.find((issue) => issue.field === field)?.message;
  const hintId = `${id}-hint`;
  const describedBy = [message ? `${id}-error` : null, hint ? hintId : null]
    .filter(Boolean)
    .join(" ");
  const labelId = `${id}-label`;
  return (
    <Field className="gap-1.5">
      <FieldLabel
        id={labelId}
        {...(labelFor ? { htmlFor: id } : {})}
        required={required ?? false}
        optional={optional ?? false}
      >
        {label}
      </FieldLabel>
      {children({
        id,
        "aria-describedby": describedBy || undefined,
        "aria-invalid": message ? true : undefined,
        labelId,
      })}
      {message ? <FieldError id={`${id}-error`}>{message}</FieldError> : null}
      {hint ? <FieldDescription id={hintId}>{hint}</FieldDescription> : null}
    </Field>
  );
}

interface Common {
  field: string;
  label: string;
  issues: FormIssue[];
  readOnly: boolean;
  required?: boolean;
  optional?: boolean;
  hint?: ReactNode;
}

export function TextField({
  value,
  onChange,
  placeholder,
  maxLength,
  ...common
}: Common & {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <DomainField {...common}>
      {({ labelId: _label, ...control }) => (
        <Input
          {...control}
          className="max-md:h-11"
          value={value}
          readOnly={common.readOnly}
          placeholder={placeholder}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </DomainField>
  );
}

export function AreaField({
  value,
  onChange,
  rows,
  placeholder,
  ...common
}: Common & {
  value: string;
  onChange: (value: string) => void;
  rows: number;
  placeholder?: string;
}) {
  return (
    <DomainField {...common}>
      {({ labelId: _label, ...control }) => (
        <Textarea
          {...control}
          rows={rows}
          value={value}
          readOnly={common.readOnly}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </DomainField>
  );
}

export function ChoiceField<V extends string>({
  value,
  options,
  onChange,
  ...common
}: Common & {
  value: V;
  options: ReadonlyArray<{ value: V; label: string }>;
  onChange: (value: V) => void;
}) {
  return (
    <DomainField {...common} labelFor={false}>
      {({ labelId, id, ...aria }) => (
        <RadioPillGroup
          {...aria}
          aria-labelledby={labelId}
          value={value}
          disabled={common.readOnly}
          onValueChange={(next) => onChange(next as V)}
        >
          {options.map((option, index) => (
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
      )}
    </DomainField>
  );
}

export function TagsField({
  value,
  onChange,
  validate,
  placeholder,
  projectId,
  kinds,
  ...common
}: Common & {
  value: string[];
  onChange: (value: string[]) => void;
  validate?: (value: string) => string | null;
  placeholder?: string;
  /** Genres cherchés par l'autocomplétion ; sans eux, saisie libre. */
  projectId?: string;
  kinds?: ReadonlyArray<"feature" | "rule" | "flow" | "table" | "endpoint" | "screen">;
}) {
  return (
    <DomainField {...common} labelFor={false}>
      {({ labelId: _label, id, ...aria }) => (
        <Tags
          {...aria}
          id={id}
          label={common.label}
          value={value}
          disabled={common.readOnly}
          onChange={onChange}
          validate={validate}
          placeholder={placeholder}
          projectId={projectId}
          kinds={kinds}
        />
      )}
    </DomainField>
  );
}

/** Saisie à puces avec autocomplétion (`spec.refs.search`) quand des genres sont donnés. */
function Tags(props: {
  id: string;
  label: string;
  value: string[];
  disabled: boolean;
  onChange: (value: string[]) => void;
  validate: ((value: string) => string | null) | undefined;
  placeholder: string | undefined;
  projectId: string | undefined;
  kinds: ReadonlyArray<"feature" | "rule" | "flow" | "table" | "endpoint" | "screen"> | undefined;
  "aria-describedby": string | undefined;
  "aria-invalid": true | undefined;
}) {
  const search = useRefsSearch(props.projectId ?? "", props.kinds);
  const lookup = props.projectId && props.kinds;
  return (
    <TagInput
      id={props.id}
      label={props.label}
      value={props.value}
      disabled={props.disabled}
      invalid={props["aria-invalid"] === true}
      aria-describedby={props["aria-describedby"]}
      placeholder={props.placeholder}
      {...(lookup ? { suggestions: search.suggestions, onQueryChange: search.onQueryChange } : {})}
      {...(props.validate ? { validate: props.validate } : {})}
      onChange={props.onChange}
    />
  );
}
