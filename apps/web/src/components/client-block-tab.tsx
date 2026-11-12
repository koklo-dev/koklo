"use client";

import type { ClientRule } from "@koklo/contract";
import {
  CountBar,
  EmptyState,
  ListFooter,
  PermissionMatrix,
  RoleCard,
  RuleCard,
  RuleTypeLegend,
  SearchField,
} from "@koklo/ui";
import { useMemo, useState } from "react";
import {
  footerState,
  useClientCards,
  useClientRoles,
  useDebouncedValue,
} from "../lib/use-client-space.ts";
import { DecisionBlock, type ReviewActions } from "./client-decision.tsx";
import { CardsSkeleton, DomainNoResults } from "./domain-list-parts.tsx";
import { ErrorNotice } from "./error-notice.tsx";

interface BlockProps {
  projectId: string;
  canValidate: boolean;
  actions: ReviewActions;
}

const RULE_NOUN = { one: "règle", other: "règles" } as const;
const NOTHING = (
  <EmptyState
    icon="gavel"
    title="Rien à valider pour l'instant"
    description="Cet onglet ne décrit encore aucun élément."
    className="mx-auto max-w-xl"
  />
);

const RULES_HELP =
  "Une règle métier est une vérité du domaine que le produit doit toujours respecter.";

/** Intro, légende des types et recherche (filtres serveur), barre de compte et recherche (maquette 10 l.227-228). */
function RulesToolbar({
  total,
  loaded,
  type,
  onType,
  query,
  onQuery,
}: {
  total: number;
  loaded: number;
  type: ClientRule["type"] | undefined;
  onType: (type: ClientRule["type"] | undefined) => void;
  query: string;
  onQuery: (query: string) => void;
}) {
  const needle = query.trim();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-meta text-muted-foreground">
        <span>{RULES_HELP}</span>
        <span className="flex-1" />
        <RuleTypeLegend value={type} onChange={onType} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <CountBar
          total={total}
          loaded={loaded}
          noun={RULE_NOUN}
          showAllLoaded
          {...(needle ? { query: needle } : {})}
        />
        <SearchField
          label="Rechercher une règle ou R-nnn"
          placeholder="Rechercher une règle ou R-nnn"
          name="q"
          autoComplete="off"
          maxLength={200}
          className="min-w-0 flex-[0_1_260px] max-md:[&_input]:h-11 max-md:flex-1 max-md:basis-full"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
      </div>
    </div>
  );
}

/** Filtres de la liste : type et texte, envoyés au serveur (anti-rebond sur le texte) ; jamais un tri des seules règles chargées. */
function useRuleFilter() {
  const [type, setType] = useState<ClientRule["type"] | undefined>();
  const [query, setQuery] = useState("");
  const settled = useDebouncedValue(query.trim());
  return { type, setType, query, setQuery, settled };
}

/** Cartes des règles, ou l'état « aucun résultat » quand un filtre ne garde rien. */
function RuleCards({
  items,
  search,
  onClearSearch,
  onClearType,
}: {
  items: ClientRule[];
  search: string;
  onClearSearch: () => void;
  onClearType: () => void;
}) {
  if (items.length === 0) {
    return (
      <DomainNoResults
        title={
          search
            ? `Aucune règle ne correspond à « ${search} »`
            : "Aucune règle ne correspond à ce type."
        }
        description={
          search
            ? "La recherche porte sur toutes les règles, pas seulement celles affichées."
            : "Choisissez un autre type pour revoir la liste."
        }
        clearLabel={search ? "Effacer la recherche" : "Effacer le filtre"}
        onClear={search ? onClearSearch : onClearType}
      />
    );
  }
  return (
    <div className="grid gap-3 lg:grid-cols-[repeat(auto-fill,minmax(420px,1fr))]">
      {items.map((rule) => (
        <RuleCard key={rule.id} {...rule} />
      ))}
    </div>
  );
}

/** Pied de liste, absent sous l'état « aucun résultat » (DESIGN.md l.247). */
function RulesFooter({
  query,
  items,
  total,
}: {
  query: Parameters<typeof footerState>[0] & {
    fetchNextPage: () => Promise<unknown>;
  };
  items: number;
  total: number;
}) {
  if (items === 0) return null;
  return (
    <ListFooter
      framed
      state={footerState(query)}
      pageSize={24}
      loadedCount={items}
      total={total}
      noun={RULE_NOUN}
      onLoadMore={() => void query.fetchNextPage()}
      onRetry={() => void query.fetchNextPage()}
    />
  );
}

/** Règles en bloc (maquette 10 l.320-328) : les cartes, puis la barre de validation du bloc en pied d'onglet. */
export function ClientRulesTab({ projectId, canValidate, actions }: BlockProps) {
  const filter = useRuleFilter();
  const { rules } = useClientCards(projectId, "rules", {
    ...(filter.settled ? { q: filter.settled } : {}),
    ...(filter.type ? { type: filter.type } : {}),
  });
  const pages = rules.data?.pages ?? [];
  const items = pages.flatMap((page) => page.items);
  const last = pages.at(-1);
  const filtered = Boolean(filter.settled || filter.type);
  if (rules.isPending) return <CardsSkeleton label="Chargement des règles métier" />;
  if (rules.isError && items.length === 0) {
    return (
      <ErrorNotice
        title="Impossible de charger les règles métier"
        onRetry={() => void rules.refetch()}
      >
        Les règles n'ont pas pu être lues.
      </ErrorNotice>
    );
  }
  if ((items.length === 0 && !filtered) || !last) return NOTHING;
  return (
    <div className="flex flex-col gap-4">
      <RulesToolbar
        total={last.total}
        loaded={items.length}
        type={filter.type}
        onType={filter.setType}
        query={filter.query}
        onQuery={filter.setQuery}
      />
      <RuleCards
        items={items}
        search={filter.settled}
        onClearSearch={() => filter.setQuery("")}
        onClearType={() => filter.setType(undefined)}
      />
      <RulesFooter query={rules} items={items.length} total={last.total} />
      {canValidate ? (
        <DecisionBlock
          variant="bar"
          noun="bloc"
          target={{ targetKind: "rules", targetRef: "rules", version: last.version }}
          validation={last.validation}
          question={
            filtered
              ? "Ces règles décrivent-elles bien votre activité ?"
              : `Ces ${last.total} règles décrivent-elles bien votre activité ?`
          }
          validateLabel="Valider les règles"
          actions={actions}
        />
      ) : null}
    </div>
  );
}

/** Rôles en bloc : cartes, matrice « Qui peut faire quoi » filtrable sur les actions chargées, barre de validation. */
export function ClientRolesTab({ projectId, canValidate, actions }: BlockProps) {
  const roles = useClientRoles(projectId, true);
  const [filter, setFilter] = useState("");
  const data = roles.data;
  const shown = useMemo(
    () =>
      (data?.actions ?? []).filter((action) =>
        action.label.toLowerCase().includes(filter.trim().toLowerCase()),
      ),
    [data, filter],
  );
  if (roles.isPending) return <CardsSkeleton label="Chargement des rôles et permissions" wide />;
  if (roles.isError || !data) {
    return (
      <ErrorNotice
        title="Impossible de charger les rôles et permissions"
        onRetry={() => void roles.refetch()}
      >
        Les rôles n'ont pas pu être lus.
      </ErrorNotice>
    );
  }
  if (data.roles.length === 0) return NOTHING;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
        {data.roles.map((role, index) => (
          <RoleCard
            key={role.id}
            id={role.id}
            name={role.name}
            description={role.description}
            index={index}
          />
        ))}
      </div>
      <PermissionMatrix
        roles={data.roles}
        actions={shown.map((action) => ({
          id: action.specId,
          label: action.label,
          resource: action.resource,
          access: action.access,
        }))}
        total={shown.length}
        filter={filter}
        onFilterChange={setFilter}
      />
      {canValidate ? (
        <DecisionBlock
          variant="bar"
          noun="bloc"
          target={{ targetKind: "roles", targetRef: "roles", version: data.version }}
          validation={data.validation}
          question="Ces rôles et permissions correspondent-ils à votre organisation ?"
          validateLabel="Valider les rôles"
          actions={actions}
        />
      ) : null}
    </div>
  );
}
