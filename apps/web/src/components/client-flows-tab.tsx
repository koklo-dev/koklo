"use client";

import type { ClientFlow } from "@koklo/contract";
import { CountBar, EmptyState, FlowCard, ListFooter, SearchField } from "@koklo/ui";
import { useState } from "react";
import { footerState, useClientCards } from "../lib/use-client-space.ts";
import { DecisionBlock, type ReviewActions } from "./client-decision.tsx";
import { CardsSkeleton } from "./domain-list-parts.tsx";
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

/** Barre de compte et recherche locale (maquette 10 l.277). */
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
  const { flows } = useClientCards(projectId, "flows");
  const pages = flows.data?.pages ?? [];
  const items = pages.flatMap((page) => page.items);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = items.filter(
    (flow) => !needle || `${flow.id} ${flow.title} ${flow.actor}`.toLowerCase().includes(needle),
  );
  const last = pages.at(-1);
  if (flows.isPending) return <CardsSkeleton label="Chargement des parcours" wide />;
  if (flows.isError && items.length === 0) {
    return (
      <ErrorNotice title="Impossible de charger les parcours" onRetry={() => void flows.refetch()}>
        Les parcours n'ont pas pu être lus.
      </ErrorNotice>
    );
  }
  if (items.length === 0 || !last) {
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
      {shown.map((flow) => (
        <FlowItem
          key={flow.id}
          flow={flow}
          version={last.version}
          canValidate={canValidate}
          actions={actions}
        />
      ))}
      <ListFooter
        framed
        state={footerState(flows)}
        pageSize={6}
        loadedCount={items.length}
        total={last.total}
        noun={NOUN}
        onLoadMore={() => void flows.fetchNextPage()}
        onRetry={() => void flows.fetchNextPage()}
      />
    </div>
  );
}
