"use client";

import type { IncidentContact } from "@koklo/contract";
import { Button, Card, Field, FieldError, FieldLabel, Input } from "@koklo/ui";
import { type FormEvent, useId, useState } from "react";
import { CONTACT_FAILED } from "../lib/security-labels.ts";
import { contactIssues, useContactSave } from "../lib/use-security-summary.ts";
import { ErrorNotice } from "./error-notice.tsx";

const FIELDS = [
  { key: "name", label: "Nom", type: "text", maxLength: 120, autoComplete: "name" },
  { key: "phone", label: "Téléphone", type: "tel", maxLength: 40, autoComplete: "tel" },
] as const;

/** Saisie du contact en cas d'incident (B801) : nom et téléphone, « Enregistrer », « Annuler ». */
export function SecurityContactForm({
  projectId,
  initial,
  onSaved,
  onCancel,
}: {
  projectId: string;
  initial: IncidentContact | undefined;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [values, setValues] = useState<IncidentContact>(initial ?? { name: "", phone: "" });
  const [issues, setIssues] = useState<Partial<IncidentContact>>({});
  const save = useContactSave(onSaved);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = contactIssues(values);
    setIssues(found);
    if (Object.keys(found).length > 0 || save.isPending) return;
    save.mutate({ projectId, name: values.name.trim(), phone: values.phone.trim() });
  };
  return (
    <Card className="px-4 py-3.5">
      <form
        noValidate
        aria-label="Contact en cas d'incident"
        className="flex flex-col gap-3"
        onSubmit={submit}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
      >
        {FIELDS.map(({ key, label, type, maxLength, autoComplete }, index) => (
          <Field key={key} className="gap-1.5">
            <FieldLabel htmlFor={`${id}-${key}`} required>
              {label}
            </FieldLabel>
            <Input
              id={`${id}-${key}`}
              type={type}
              maxLength={maxLength}
              autoComplete={autoComplete}
              autoFocus={index === 0}
              className="max-md:h-11"
              value={values[key]}
              aria-invalid={issues[key] ? true : undefined}
              aria-describedby={issues[key] ? `${id}-${key}-error` : undefined}
              onChange={(event) => setValues({ ...values, [key]: event.target.value })}
            />
            {issues[key] ? <FieldError id={`${id}-${key}-error`}>{issues[key]}</FieldError> : null}
          </Field>
        ))}
        {save.isError ? <ErrorNotice>{CONTACT_FAILED}</ErrorNotice> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="h-8 max-md:h-11" disabled={save.isPending}>
            Enregistrer
          </Button>
          <Button type="button" variant="ghost" className="h-8 max-md:h-11" onClick={onCancel}>
            Annuler
          </Button>
        </div>
      </form>
    </Card>
  );
}
