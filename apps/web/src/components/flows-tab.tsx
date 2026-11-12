"use client";

import { Button, FlowCard, Icon } from "@koklo/ui";
import { useEffect } from "react";
import type { DomainPageModel } from "../lib/use-domain-page.ts";
import {
  CardsSkeleton,
  DomainEmpty,
  DomainFooter,
  DomainNoResults,
  DomainToolbar,
  LoadPrevious,
} from "./domain-list-parts.tsx";
import { ProposeEntry } from "./features-header-action.tsx";

export const FlowsSkeleton = () => <CardsSkeleton label="Chargement des parcours" wide />;

/** Parcours choisi par un lien direct (`?sel=P-reserver`) : placé dans l'écran, une fois. */
function useScrollToSelected(selected: string | undefined, ready: boolean): void {
  useEffect(() => {
    if (!selected || !ready) return;
    document
      .querySelector<HTMLElement>(`[data-spec-id="${selected}"]`)
      ?.scrollIntoView({ block: "center" });
  }, [selected, ready]);
}

export function FlowsList({ page }: { page: DomainPageModel }) {
  const { functional } = page.data;
  const { url, form } = page;
  const flows = functional.items.filter((item) => item.kind === "flow");
  useScrollToSelected(url.feature, flows.length > 0);
  return (
    <div className="flex flex-col gap-4">
      <DomainToolbar
        page={page}
        total={functional.total}
        loaded={flows.length}
        searchLabel="Rechercher un parcours"
      />
      <LoadPrevious page={page} />
      {flows.map((flow) => (
        <FlowCard
          key={flow.specId}
          id={flow.specId}
          title={flow.title}
          actor={flow.actor}
          steps={[flow.start, ...flow.steps]}
          errors={flow.errors}
          features={flow.features}
          selected={url.feature === flow.specId}
          {...(form.canWrite ? { onEdit: () => form.openEdit(flow.specId) } : {})}
        />
      ))}
      <DomainFooter page={page} />
    </div>
  );
}

export function FlowsEmpty({ page }: { page: DomainPageModel }) {
  const { form, propose, url } = page;
  return (
    <DomainEmpty
      icon="route"
      title="Aucun parcours pour l'instant"
      description="Un parcours décrit, étape par étape, comment un acteur atteint son but, avec les cas d'erreur."
      action={
        form.canWrite ? (
          <Button type="button" className="h-11 md:h-9" onClick={form.openCreate}>
            <Icon name="add" size={20} />
            Nouveau parcours
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

export function FlowsNoResults({ page }: { page: DomainPageModel }) {
  const { url, search } = page;
  return (
    <div className="flex flex-col gap-3">
      <DomainToolbar page={page} total={0} loaded={0} searchLabel="Rechercher un parcours" />
      <DomainNoResults
        title={`Aucun parcours ne correspond à « ${url.q ?? ""} »`}
        description={`La recherche porte sur les ${page.data.head?.counts.flows ?? ""} parcours, pas seulement ceux affichés.`}
        clearLabel="Effacer la recherche"
        onClear={search.clear}
      />
    </div>
  );
}
