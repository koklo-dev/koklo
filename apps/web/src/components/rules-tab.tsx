"use client";

import { Button, Icon, RuleCard, RuleTypeLegend } from "@koklo/ui";
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

const HELP = "Une règle métier est une vérité du domaine que le produit doit toujours respecter.";

export const RulesSkeleton = () => <CardsSkeleton label="Chargement des règles métier" />;

/** Une carte amenée par un lien direct (`?sel=R-250`) se place dans l'écran, une fois. */
function useScrollToSelected(selected: string | undefined, ready: boolean): void {
  useEffect(() => {
    if (!selected || !ready) return;
    document
      .querySelector<HTMLElement>(`[data-spec-id="${selected}"]`)
      ?.scrollIntoView({ block: "center" });
  }, [selected, ready]);
}

/** Phrase d'aide et légende des types : elle reste visible sans résultat, pour retirer le filtre par sa pastille. */
function RulesLegend({ page }: { page: DomainPageModel }) {
  const { url } = page;
  return (
    <div className="flex flex-wrap items-center gap-2 text-meta text-muted-foreground">
      <span>{HELP}</span>
      <span className="flex-1" />
      <RuleTypeLegend
        value={url.type}
        onChange={(type) => url.setFilters({ type: type ?? null })}
      />
    </div>
  );
}

export function RulesList({ page }: { page: DomainPageModel }) {
  const { functional } = page.data;
  const { url, form } = page;
  const rules = functional.items.filter((item) => item.kind === "rule");
  useScrollToSelected(url.feature, rules.length > 0);
  return (
    <div className="flex flex-col gap-3">
      <DomainToolbar
        page={page}
        total={functional.total}
        loaded={rules.length}
        searchLabel="Rechercher une règle ou R-nnn"
      >
        <RulesLegend page={page} />
      </DomainToolbar>
      <LoadPrevious page={page} />
      <div className="grid gap-3 lg:grid-cols-[repeat(auto-fill,minmax(420px,1fr))]">
        {rules.map((rule) => (
          <RuleCard
            key={rule.specId}
            id={rule.specId}
            title={rule.title}
            type={rule.type}
            statement={rule.statement}
            example={rule.example}
            states={rule.states}
            features={rule.features}
            selected={url.feature === rule.specId}
            {...(form.canWrite ? { onEdit: () => form.openEdit(rule.specId) } : {})}
          />
        ))}
      </div>
      <DomainFooter page={page} />
    </div>
  );
}

export function RulesEmpty({ page }: { page: DomainPageModel }) {
  const { form, propose, url } = page;
  return (
    <DomainEmpty
      icon="gavel"
      title="Aucune règle métier pour l'instant"
      description={HELP}
      action={
        form.canWrite ? (
          <Button type="button" className="h-11 md:h-9" onClick={form.openCreate}>
            <Icon name="add" size={20} />
            Nouvelle règle
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

export function RulesNoResults({ page }: { page: DomainPageModel }) {
  const { url, search } = page;
  return (
    <div className="flex flex-col gap-3">
      <DomainToolbar page={page} total={0} loaded={0} searchLabel="Rechercher une règle ou R-nnn">
        <RulesLegend page={page} />
      </DomainToolbar>
      <DomainNoResults
        title={
          url.q
            ? `Aucune règle ne correspond à « ${url.q} »`
            : "Aucune règle ne correspond à ce type."
        }
        description={
          url.q
            ? `La recherche porte sur les ${page.data.head?.counts.rules ?? ""} règles, pas seulement celles affichées.`
            : "Choisissez un autre type pour revoir la liste."
        }
        clearLabel={url.q ? "Effacer la recherche" : "Effacer le filtre"}
        onClear={url.q ? search.clear : () => url.setFilters({ type: null })}
      />
    </div>
  );
}
