"use client";

import type { ClientFeatureSummary, ClientSpaceProgress } from "@koklo/contract";
import {
  Button,
  CountBar,
  EmptyState,
  FilterChip,
  IdTag,
  ListFooter,
  ListRow,
  PriorityIndicator,
  SearchField,
  Skeleton,
  SpecCollection,
  ValidationStatus,
} from "@koklo/ui";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { validationOf } from "../lib/client-validation-labels.ts";
import { criteriaLabel, priorityLabel, priorityLevel } from "../lib/feature-labels.ts";
import { footerState, useClientFeatures } from "../lib/use-client-space.ts";
import type { ReviewActions } from "./client-decision.tsx";
import { ClientFeatureSheet } from "./client-feature-sheet.tsx";
import { ErrorNotice } from "./error-notice.tsx";

const TAB_OF_KIND = { feature: "features", flow: "flows", rules: "rules", roles: "roles" } as const;
const NOUN = { one: "fonctionnalité", other: "fonctionnalités" } as const;

/** Priorité avec son libellé puis validation (maquette 10 l.193-194) : jamais une couleur seule. */
function RowStatus({ feature }: { feature: ClientFeatureSummary }) {
  return (
    <>
      <PriorityIndicator
        level={priorityLevel(feature.priority)}
        label={priorityLabel(feature.priority)}
        className="md:w-28"
      />
      <ValidationStatus status={validationOf(feature.validation)} />
    </>
  );
}

function Row({
  feature,
  selected,
  onOpen,
}: {
  feature: ClientFeatureSummary;
  selected: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <ListRow
      as="div"
      selected={selected}
      data-feature-id={feature.id}
      onSelect={() => onOpen(feature.id)}
      leading={<IdTag className="shrink-0">{feature.id}</IdTag>}
      title={feature.title}
      subtitle={
        <>
          <span>{criteriaLabel(feature.criteriaCount)}</span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 md:hidden">
            <RowStatus feature={feature} />
          </span>
        </>
      }
      trailing={
        <div className="hidden shrink-0 items-center gap-1.5 md:flex">
          <RowStatus feature={feature} />
        </div>
      }
    />
  );
}

interface TabProps {
  projectId: string;
  progress: ClientSpaceProgress;
  /** Instant de la dernière lecture de la progression (`dataUpdatedAt`). */
  progressUpdatedAt: number;
  clientName: string;
  actions: ReviewActions;
}

/** Sélection, annonce et focus du passage à la suivante non traitée (B350, passation 07 §1.4). */
function useNextFeature(
  progress: ClientSpaceProgress,
  updatedAt: number,
  router: { push: (href: string) => void },
) {
  const [selected, setSelected] = useState<string | undefined>();
  const [around, setAround] = useState<string | undefined>();
  const [message, setMessage] = useState("");
  /** Décision enregistrée : son verbe, et l'instant de la progression lue avant (la suivante se lit après). */
  const [waiting, setWaiting] = useState<{ verb: string; since: number } | undefined>();
  const titleRef = useRef<HTMLHeadingElement>(null);
  /** Le titre de la fiche choisie prend le focus dès qu'elle est lue (la fiche se charge après le choix). */
  const [focusTitle, setFocusTitle] = useState(false);
  const { next } = progress;
  useEffect(() => {
    if (!waiting || updatedAt <= waiting.since) return;
    setWaiting(undefined);
    if (next?.kind === "feature") {
      setSelected(next.ref);
      setMessage(`${waiting.verb}. Suivante : ${next.ref}`);
      setFocusTitle(true);
    } else {
      setMessage(
        next
          ? `${waiting.verb}. Il reste des éléments dans un autre onglet.`
          : `${waiting.verb}. Tout est traité.`,
      );
    }
  }, [waiting, next, updatedAt]);
  const goToNext = () => {
    if (next?.kind === "feature") {
      setSelected(next.ref);
      setAround(next.ref);
      setFocusTitle(true);
    } else if (next) router.push(`?tab=${TAB_OF_KIND[next.kind]}`);
  };
  const decided = (verb: string) => setWaiting({ verb, since: updatedAt });
  return {
    selected,
    setSelected,
    around,
    setAround,
    message,
    decided,
    titleRef,
    focusTitle,
    setFocusTitle,
    goToNext,
  };
}

type Flow = ReturnType<typeof useNextFeature>;
type FeatureList = ReturnType<typeof useClientFeatures>;

interface PaneProps {
  list: FeatureList;
  items: ClientFeatureSummary[];
  progress: ClientSpaceProgress;
  flow: Flow;
  search: { query: string; setQuery: (value: string) => void };
  untreated: { on: boolean; set: (value: boolean) => void };
}

/** Recherche, filtre « Non traitées », compte, lien vers la suivante non traitée. */
function Toolbar({ list, progress, flow, search, untreated }: Omit<PaneProps, "items">) {
  const needle = search.query.trim();
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <SearchField
          label="Rechercher une fonctionnalité"
          placeholder="Rechercher par titre ou F-nnn"
          name="q"
          autoComplete="off"
          maxLength={200}
          className="min-w-0 max-w-[300px] flex-[1_1_220px] max-md:[&_input]:h-11"
          value={search.query}
          onChange={(event) => search.setQuery(event.target.value)}
        />
        <FilterChip pressed={untreated.on} onPressedChange={untreated.set}>
          Non traitées
        </FilterChip>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <CountBar
          total={list.total}
          loaded={list.items.length}
          noun={NOUN}
          filterLabel={`${progress.tabs.features.units - progress.tabs.features.treated} à traiter`}
          announcement={flow.message}
          sort="identifiant"
          {...(needle ? { query: needle } : {})}
        />
        {progress.next ? (
          <Button type="button" variant="text" className="h-11 md:h-[26px]" onClick={flow.goToNext}>
            Aller à la suivante non traitée
          </Button>
        ) : null}
      </div>
    </>
  );
}

/** Colonne de gauche : barre d'outils, lignes, pied de liste. */
function ListPane(props: PaneProps) {
  const { list, items, flow, search } = props;
  const nothing = !search.query.trim() && (props.untreated.on || list.total === 0);
  return (
    <>
      <Toolbar {...props} />
      {items.length === 0 ? (
        <EmptyState
          variant="inline"
          bordered
          icon={nothing ? "task_alt" : "search_off"}
          title={nothing ? "Rien à valider pour l'instant" : "Aucune fonctionnalité trouvée"}
          description={
            nothing
              ? "Aucune fonctionnalité n'attend votre décision."
              : "Essayez un autre titre ou un autre numéro."
          }
        />
      ) : (
        <ul
          aria-label="Fonctionnalités"
          className="m-0 list-none overflow-hidden rounded-xl border p-0"
        >
          {items.map((feature) => (
            <li key={feature.id} className="border-t first:border-t-0">
              <Row
                feature={feature}
                selected={flow.selected === feature.id}
                onOpen={flow.setSelected}
              />
            </li>
          ))}
        </ul>
      )}
      <ListFooter
        framed
        state={footerState(list.query)}
        pageSize={50}
        loadedCount={list.items.length}
        total={list.total}
        noun={NOUN}
        onLoadMore={() => void list.query.fetchNextPage()}
        onRetry={() => void list.query.fetchNextPage()}
      />
    </>
  );
}

/** Fonctionnalités une par une (maquette 10 l.178-221) : recherche, filtre « Non traitées », liste et fiche à droite. */
export function ClientFeaturesTab({
  projectId,
  progress,
  progressUpdatedAt,
  clientName,
  actions,
}: TabProps) {
  const [untreated, setUntreated] = useState(false);
  const [query, setQuery] = useState("");
  const flow = useNextFeature(progress, progressUpdatedAt, useRouter());
  const list = useClientFeatures({ projectId, untreated, around: flow.around });
  const needle = query.trim().toLowerCase();
  const items = list.items.filter(
    (item) => !needle || `${item.id} ${item.title}`.toLowerCase().includes(needle),
  );
  if (list.query.isPending) return <Skeleton aria-busy="true" className="h-64 rounded-xl" />;
  if (list.query.isError && list.items.length === 0) {
    return (
      <ErrorNotice
        title="Impossible de charger les fonctionnalités"
        onRetry={() => void list.query.refetch()}
      >
        Les fonctionnalités n'ont pas pu être lues.
      </ErrorNotice>
    );
  }
  return (
    <SpecCollection
      detailLabel="Fiche de la fonctionnalité"
      onCloseDetail={() => flow.setSelected(undefined)}
      list={
        <ListPane
          list={list}
          items={items}
          progress={progress}
          flow={flow}
          search={{ query, setQuery }}
          untreated={{ on: untreated, set: setUntreated }}
        />
      }
      {...(flow.selected
        ? {
            detail: (
              <ClientFeatureSheet
                projectId={projectId}
                featureId={flow.selected}
                canValidate={progress.canValidate}
                clientName={clientName}
                actions={actions}
                titleRef={flow.titleRef}
                focusTitle={flow.focusTitle}
                onFocused={() => flow.setFocusTitle(false)}
                onDecided={flow.decided}
              />
            ),
          }
        : {})}
    />
  );
}
