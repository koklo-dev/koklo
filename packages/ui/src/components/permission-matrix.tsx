"use client";

import type { ReactNode, Ref } from "react";
import { Icon } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { formatCount } from "../lib/format-count.ts";
import { SearchField } from "./search-field.tsx";

export type AccessLevel = "allowed" | "restricted" | "denied";

export interface MatrixRole {
  id: string;
  name: string;
}

export interface MatrixAction {
  id: string;
  label: string;
  resource: string;
  /** Un accès par rôle, dans l'ordre de `roles`. */
  access: ReadonlyArray<{ level: AccessLevel; restriction?: string | undefined }>;
}

export interface MatrixGroup {
  resource: string;
  count: number;
  open: boolean;
}

/** Au-delà de ce nombre d'actions, la matrice se range en groupes par ressource (maquette 10 l.269). */
export const MATRIX_GROUP_THRESHOLD = 20;

export interface PermissionMatrixProps {
  roles: readonly MatrixRole[];
  actions: readonly MatrixAction[];
  /** Groupes par ressource ; ignorés tant que `total` ne dépasse pas 20. */
  groups?: readonly MatrixGroup[];
  /** Nombre d'actions de la matrice (ouvertes ou non). */
  total: number;
  filter: string;
  onFilterChange: (value: string) => void;
  onToggleGroup?: (resource: string, open: boolean) => void;
  /** Champ « Filtrer les actions » : le raccourci `/` de l'écran y met le focus. */
  filterRef?: Ref<HTMLInputElement>;
  className?: string;
}

const lowerFirst = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);

/** Cellule d'accès : icône décorative et texte visible à 12 px (jamais l'icône seule). */
function AccessCell({
  level,
  restriction,
}: {
  level: AccessLevel;
  restriction?: string | undefined;
}) {
  if (level === "denied") {
    return (
      <span className="inline-flex items-center gap-1 text-caption text-muted-foreground">
        <Icon name="remove" size={18} className="text-border-strong" />
        non autorisé
      </span>
    );
  }
  const restricted = level === "restricted";
  return (
    <span className="inline-flex items-center gap-1 text-caption">
      <Icon
        name="check_circle"
        size={18}
        fill
        className={restricted ? "text-primary" : "text-status-validated-foreground"}
      />
      {restricted && restriction ? `autorisé : ${lowerFirst(restriction)}` : "autorisé"}
    </span>
  );
}

function ActionRow({ action }: { action: MatrixAction }) {
  return (
    <tr className="border-t border-border">
      <th scope="row" className="px-4 py-2.5 text-left font-medium">
        <span className="flex flex-col">
          <span>{action.label}</span>
          <span className="font-mono text-code-sm font-normal text-muted-foreground">
            {action.id}
          </span>
        </span>
      </th>
      {action.access.map((cell, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: une cellule par rôle, dans l'ordre des colonnes
        <td key={`${action.id}-${index}`} className="px-3 py-2.5 text-center">
          <AccessCell level={cell.level} restriction={cell.restriction} />
        </td>
      ))}
    </tr>
  );
}

function GroupRow({
  group,
  span,
  onToggle,
}: {
  group: MatrixGroup;
  span: number;
  onToggle: PermissionMatrixProps["onToggleGroup"];
}) {
  return (
    <tr className="border-t border-border bg-surface">
      <th scope="rowgroup" colSpan={span} className="px-3 py-1 text-left">
        <button
          type="button"
          aria-expanded={group.open}
          onClick={() => onToggle?.(group.resource, !group.open)}
          className="inline-flex h-[30px] items-center gap-1.5 rounded-md px-1 text-meta font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:h-11"
        >
          <Icon
            name="keyboard_arrow_down"
            size={18}
            className={cn("text-muted-foreground", !group.open && "-rotate-90")}
          />
          {group.resource}
          <span className="text-caption font-normal text-muted-foreground">
            · {group.count} action{group.count > 1 ? "s" : ""}
          </span>
        </button>
      </th>
    </tr>
  );
}

function bodyOf(props: PermissionMatrixProps, span: number): ReactNode[] {
  const { actions, groups = [], total, onToggleGroup } = props;
  if (total <= MATRIX_GROUP_THRESHOLD || groups.length === 0) {
    return actions.map((action) => <ActionRow key={action.id} action={action} />);
  }
  return groups.flatMap((group) => [
    <GroupRow key={`g-${group.resource}`} group={group} span={span} onToggle={onToggleGroup} />,
    ...(group.open
      ? actions
          .filter((action) => action.resource === group.resource)
          .map((action) => <ActionRow key={action.id} action={action} />)
      : []),
  ]);
}

/**
 * « Qui peut faire quoi » (DESIGN.md §5.16, maquette 10 l.257-273) : un vrai tableau, une ligne par action, une
 * colonne par rôle. Le cadre défile en horizontal et se lit au clavier ; au-delà de 20 actions, des lignes de
 * groupe par ressource se déplient.
 */
export function PermissionMatrix(props: PermissionMatrixProps) {
  const { roles, total, filter, onFilterChange, filterRef, className } = props;
  return (
    <section
      data-slot="permission-matrix"
      aria-label="Qui peut faire quoi, défilement horizontal"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: région qui défile, atteignable au clavier (WCAG 2.1.1)
      tabIndex={0}
      className={cn(
        "overflow-auto rounded-xl border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <table
        aria-label="Qui peut faire quoi"
        className="w-full min-w-[640px] border-collapse text-body"
      >
        <caption className="border-b border-border px-4 py-3 text-left">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-subsection-title">Qui peut faire quoi</span>
            <span className="text-caption font-normal text-muted-foreground">
              {formatCount(total)} action{total > 1 ? "s" : ""} · groupées par ressource au-delà de
              20
            </span>
            <span className="flex-1" />
            <SearchField
              {...(filterRef ? { ref: filterRef } : {})}
              label="Filtrer les actions"
              placeholder="Filtrer les actions"
              name="actions"
              autoComplete="off"
              maxLength={200}
              className="min-w-0 flex-[0_1_260px] max-md:[&_input]:h-11"
              value={filter}
              onChange={(event) => onFilterChange(event.target.value)}
            />
          </span>
        </caption>
        <thead>
          <tr className="bg-surface text-left text-caption text-muted-foreground">
            <th scope="col" className="px-4 py-2.5 font-medium">
              Action
            </th>
            {roles.map((role) => (
              <th key={role.id} scope="col" className="px-3 py-2.5 text-center font-medium">
                {role.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{bodyOf(props, roles.length + 1)}</tbody>
      </table>
    </section>
  );
}
