"use client";

import { Button, Icon, PermissionMatrix, RoleCard } from "@koklo/ui";
import type { DomainPageModel } from "../lib/use-domain-page.ts";
import { CardsSkeleton, DomainEmpty, DomainNoResults } from "./domain-list-parts.tsx";
import { ProposeEntry } from "./features-header-action.tsx";

export const RolesSkeleton = () => (
  <CardsSkeleton label="Chargement des rôles et permissions" wide />
);

export function RolesList({ page }: { page: DomainPageModel }) {
  const { matrix } = page.data;
  const { url, form, search } = page;
  return (
    <div className="flex flex-col gap-4">
      {/* Une seule région d'état dans le document : elle annonce le résultat du filtre et les avis d'écriture ;
          formulaire ouvert, c'est celle du panneau. */}
      {form.open ? null : (
        <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {page.region.countText}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
        {matrix.roles.map((role, index) => (
          <RoleCard
            key={role.specId}
            id={role.specId}
            name={role.name}
            description={role.description}
            index={index}
            selected={url.feature === role.specId}
            {...(form.canWrite ? { onEdit: () => form.openEdit(role.specId) } : {})}
          />
        ))}
      </div>
      <PermissionMatrix
        roles={matrix.roles.map((role) => ({ id: role.specId, name: role.name }))}
        actions={matrix.actions.map((action) => ({
          id: action.specId,
          label: action.label,
          resource: action.resource,
          access: action.access,
        }))}
        groups={matrix.groups}
        total={matrix.total}
        filter={search.text}
        onFilterChange={search.onChange}
        onToggleGroup={matrix.toggleGroup}
        filterRef={search.inputRef}
      />
      {matrix.total === 0 && url.q ? (
        <DomainNoResults
          title={`Aucune action ne correspond à « ${url.q} »`}
          description="Le filtre porte sur toutes les actions de la matrice."
          clearLabel="Effacer le filtre"
          onClear={search.clear}
        />
      ) : null}
    </div>
  );
}

export function RolesEmpty({ page }: { page: DomainPageModel }) {
  const { form, propose, url } = page;
  return (
    <DomainEmpty
      icon="admin_panel_settings"
      title="Aucun rôle pour l'instant"
      description="Un rôle regroupe ce qu'un type d'utilisateur peut faire ; la matrice dit qui peut faire quoi."
      action={
        form.canWrite ? (
          <Button type="button" className="h-11 md:h-9" onClick={form.openCreate}>
            <Icon name="add" size={20} />
            Nouveau rôle
          </Button>
        ) : undefined
      }
      secondaryAction={
        propose.enabled && form.canWrite ? (
          <ProposeEntry propose={propose} onReview={url.openReview} />
        ) : undefined
      }
    />
  );
}
