"use client";

import type { ClientFlow } from "@koklo/contract";
import { CountBar, EmptyState, FlowCard, ListFooter, SearchField } from "@koklo/ui";
import { useState } from "react";
import { footerState, useClientCards, useDebouncedValue } from "../lib/use-client-space.ts";
import { DecisionBlock, type ReviewActions } from "./client-decision.tsx";
import { CardsSkeleton, DomainNoResults } from "./domain-list-parts.tsx";
import { ErrorNotice } from "./error-notice.tsx";

const NOUN = { one: "parcours", other: "parcours", masculine: true } as const;

/** Une carte de parcours et, dessous, la décision du client. */
function FlowItem({
  flow,
  version,
  canValidate,
  actions,
}: {
  flow: ClientFlow;
  version: string;
  canValidate: boolean;
  actions: ReviewActions;
}) {
  return (
    <div className="flex flex-col rounded-xl border bg-background">
      <FlowCard
        id={flow.id}
        title={flow.title}
        actor={flow.actor}
        steps={[flow.start, ...flow.steps]}
        errors={flow.errors}
        features={flow.features}
        className={canValidate ? "border-0 pb-0" : "border-0"}
      />
      {canValidate ? (
        <div className="px-4 pt-3.5 pb-4">
          <DecisionBlock
            variant="inline"
            noun="parcours"
            target={{ targetKind: "flow", targetRef: flow.id, version }}
            validation={flow.validation}
            question="Ce parcours correspond-il à ce que vivent vos clients ?"
            validateLabel="Valider ce parcours"
            askLabel="Que faut-il changer dans ce parcours ?"
            placeholder="ex. « le client doit pouvoir choisir son coiffeur avant le créneau »"
            rows={2}
            actions={actions}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Barre de compte et recherche serveur (maquette 10 l.277). */
function FlowsToolbar({
  total,
  loaded,
  query,
  onQuery,
}: {
  total: number;
  loaded: number;
  query: string;
  onQuery: (query: string) => void;
}) {
  const needle = query.trim();
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <CountBar
        total={total}
        loaded={loaded}
        noun={NOUN}
        showAllLoaded
        {...(needle ? { query: needle } : {})}
      />
      <SearchField
        label="Rechercher un parcours"
        placeholder="Rechercher un parcours"
        name="q"
        autoComplete="off"
        maxLength={200}
        className="min-w-0 flex-[0_1_260px] max-md:[&_input]:h-11 max-md:flex-1 max-md:basis-full"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
      />
    </div>
  );
}

/** Pied de liste, absent sous l'état « aucun résultat » (DESIGN.md l.247). */
function FlowsFooter({
  query,
  items,
  total,
}: {
  query: Parameters<typeof footerState>[0] & { fetchNextPage: () => Promise<unknown> };
  items: number;
  total: number;
}) {
  if (items === 0) return null;
  return (
    <ListFooter
      framed
      state={footerState(query)}
      pageSize={6}
      loadedCount={items}
      total={total}
      noun={NOUN}
      onLoadMore={() => void query.fetchNextPage()}
      onRetry={() => void query.fetchNextPage()}
    />
  );
}

/** Parcours un par un (maquette 10 l.286-318) : la carte, puis la décision du client sous chacune. */
export function ClientFlowsTab({
  projectId,
  canValidate,
  actions,
}: {
  projectId: string;
  canValidate: boolean;
  actions: ReviewActions;
}) {
  const [query, setQuery] = useState("");
  const settled = useDebouncedValue(query.trim());
  const { flows } = useClientCards(projectId, "flows", settled ? { q: settled } : {});
  const pages = flows.data?.pages ?? [];
  const items = pages.flatMap((page) => page.items);
  const last = pages.at(-1);
  if (flows.isPending) return <CardsSkeleton label="Chargement des parcours" wide />;
  if (flows.isError && items.length === 0) {
    return (
      <ErrorNotice title="Impossible de charger les parcours" onRetry={() => void flows.refetch()}>
        Les parcours n'ont pas pu être lus.
      </ErrorNotice>
    );
  }
  if ((items.length === 0 && !settled) || !last) {
    return (
      <EmptyState
        icon="route"
        title="Rien à valider pour l'instant"
        description="Aucun parcours n'est encore décrit."
        className="mx-auto max-w-xl"
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <FlowsToolbar total={last.total} loaded={items.length} query={query} onQuery={setQuery} />
      {items.length === 0 ? (
        <DomainNoResults
          title={`Aucun parcours ne correspond à « ${settled} »`}
          description="La recherche porte sur tous les parcours, pas seulement ceux affichés."
          clearLabel="Effacer la recherche"
          onClear={() => setQuery("")}
        />
      ) : (
        items.map((flow) => (
          <FlowItem
            key={flow.id}
            flow={flow}
            version={last.version}
            canValidate={canValidate}
            actions={actions}
          />
        ))
      )}
      <FlowsFooter query={flows} items={items.length} total={last.total} />
    </div>
  );
}
