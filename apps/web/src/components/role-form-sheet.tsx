"use client";

import type { RoleDetail } from "@koklo/contract";
import {
  EMPTY_ROLE,
  isPermissionTag,
  type RoleValues,
  roleIssues,
  roleOperationOf,
  roleValuesOf,
} from "../lib/domain-operations.ts";
import { AreaField, TagsField, TextField } from "./domain-form-fields.tsx";
import {
  type DomainFormConfig,
  type DomainFormProps,
  DomainFormSheet,
  type FieldsContext,
} from "./domain-form-sheet.tsx";

const permissionTag = (tag: string): string | null =>
  isPermissionTag(tag)
    ? null
    : `« ${tag} » n'est pas une permission (exemple : PM-agenda.lire, ou PM-reservation.modifier (les siennes)).`;

function RoleFields({ values, set, issues, readOnly }: FieldsContext<RoleValues>) {
  const common = { issues, readOnly };
  return (
    <>
      <TextField
        {...common}
        field="name"
        label="Nom"
        required
        value={values.name}
        maxLength={120}
        onChange={(name) => set({ name })}
      />
      <AreaField
        {...common}
        field="description"
        label="Description"
        required
        rows={2}
        value={values.description}
        onChange={(description) => set({ description })}
      />
      <TagsField
        {...common}
        field="permissions"
        label="Permissions"
        required
        value={values.permissions}
        placeholder="PM-ressource.action"
        hint="Codes PM-ressource.action ; une restriction s'écrit entre parenthèses."
        validate={permissionTag}
        onChange={(permissions) => set({ permissions })}
      />
    </>
  );
}

const CONFIG: DomainFormConfig<RoleValues, "role", RoleDetail> = {
  type: "role",
  icon: "admin_panel_settings",
  noun: { create: "Nouveau rôle", edit: "Modifier le rôle", loading: "Chargement du rôle…" },
  bodyLabel: "Saisie du rôle",
  newFile: "domain/roles.yaml",
  conflict: "Un rôle de ce nom existe déjà.",
  empty: EMPTY_ROLE,
  valuesOf: roleValuesOf,
  issuesOf: roleIssues,
  operationOf: roleOperationOf,
  titleOf: (values) => values.name.trim(),
  labels: { name: "Nom", description: "Description", permissions: "Permissions" },
  fields: RoleFields,
};

/** Formulaire Rôle (11 §3) : Nom*, Description*, Permissions* (PM-… et restriction entre parenthèses). */
export function RoleFormSheet(props: DomainFormProps) {
  return <DomainFormSheet props={props} config={CONFIG} />;
}
