"use client";

import type { MemberRole } from "@koklo/contract";
import {
  Field,
  FieldError,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@koklo/ui";
import { type Ref, useId } from "react";
import { ROLE_LABELS } from "../lib/roles.ts";

interface RoleFieldProps {
  roles: MemberRole[];
  value: string;
  onValueChange: (value: string) => void;
  disabled: boolean;
  error: string | undefined;
  triggerRef: Ref<HTMLButtonElement>;
}

/** Sélecteur de rôle sans valeur par défaut : on n'invite pas avec des droits que l'on n'a pas choisis. */
export function RoleField({
  roles,
  value,
  onValueChange,
  disabled,
  error,
  triggerRef,
}: RoleFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <Field>
      <Label htmlFor={id}>Rôle</Label>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger
          id={id}
          ref={triggerRef}
          className="h-11 md:h-9"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        >
          <SelectValue placeholder="Choisir un rôle" />
        </SelectTrigger>
        <SelectContent>
          {roles.map((role) => (
            <SelectItem key={role} value={role}>
              {ROLE_LABELS[role]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </Field>
  );
}
