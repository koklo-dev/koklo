import { cn, Field, FieldDescription, FieldError, Input, Label } from "@koklo/ui";
import { type ComponentProps, useId } from "react";

interface FormFieldProps extends Omit<ComponentProps<"input">, "id"> {
  label: string;
  error?: string | undefined;
  hint?: string;
  /** Annonce l'erreur (`role="alert"`) ; à désactiver quand une autre alerte du même écran est déjà annoncée. */
  announceError?: boolean;
}

/** Champ texte accessible : `Label` associé, aide et erreur liées par `aria-describedby` (erreur d'abord). */
export function FormField({
  label,
  error,
  hint,
  announceError = true,
  className,
  ...input
}: FormFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ");
  return (
    <Field>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        className={cn("h-11 md:h-9", className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        {...input}
      />
      {error ? (
        <FieldError id={errorId} role={announceError ? "alert" : undefined}>
          {error}
        </FieldError>
      ) : null}
      {hint ? <FieldDescription id={hintId}>{hint}</FieldDescription> : null}
    </Field>
  );
}
