"use client";

import type { ClientSpaceArchitecture } from "@koklo/contract";
import {
  ArchNodeCard,
  Button,
  CountBar,
  cn,
  DiagramViewer,
  EmptyState,
  EntityChip,
  Icon,
  IdTag,
  InlineAlert,
  ListFooter,
  ListPanel,
  SearchField,
  SequenceDiagram,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@koklo/ui";
import { type ReactNode, useMemo } from "react";
import {
  CLIENT_SERVES_LABEL,
  CLIENT_SUMMARY_MISSING,
  CLIENT_TRUNCATED_NOTE,
} from "../lib/architecture-client-labels.ts";
import {
  type ArchNode,
  type ArchZoneDetail,
  bandsOf,
  nodesOf,
  positionsOf,
  relationsOf,
} from "../lib/architecture-diagram.ts";
import {
  COMPONENT_NOUN,
  componentTypeLabel,
  DECISION_NOUN,
  DECISIONS_SEARCH_LABEL,
  DECISIONS_SEARCH_PLACEHOLDER,
  FLOW_NOUN,
} from "../lib/architecture-labels.ts";
import { ADR_STATUS_PARAMS, type AdrStatusParam } from "../lib/architecture-tab.ts";
import { orpc } from "../lib/orpc.ts";
import type { ArchitectureUrlModel } from "../lib/use-architecture-url.ts";
import { useAutoLoad } from "../lib/use-auto-load.ts";
import {
  CLIENT_PAGE_SIZE,
  type ClientDecisions,
  type ClientFlows,
  useClientDecision,
  useClientFlow,
} from "../lib/use-client-architecture.ts";
import { useDiagramFullscreen } from "../lib/use-diagram-fullscreen.ts";
import { useListFooter, useSearchBox } from "../lib/use-features-list.ts";
import { TypePill } from "./architecture-components-tab.tsx";
import { ArchitectureDecisionFiche } from "./architecture-decision-fiche.tsx";
import { ArchitectureDecisionList, BackToList } from "./architecture-decision-list.tsx";
import { STATUS_LABELS } from "./architecture-decisions-tab.tsx";
import { ComponentFicheHeader } from "./architecture-fiche-header.tsx";
import { FlowHeading, FlowRow } from "./architecture-flow-parts.tsx";
import { FicheFrame, useDiagramZoom, VIEWER_HEIGHT } from "./data-diagram-parts.tsx";
import { ErrorNotice } from "./error-notice.tsx";
import { FilterChipMenu } from "./features-filters.tsx";

export type ClientModel = ClientSpaceArchitecture;
type Component = ClientModel["items"][number];
export type CommentTarget = { kind: "component" | "adr" | "archflow"; ref: string; name: string };

interface Shared {
  url: ArchitectureUrlModel;
  /** Seul le client commente (B582) : sans lui, aucun bouton « Commenter ». */
  onComment: ((target: CommentTarget) => void) | undefined;
}

/** Fiche d'un composant au vocabulaire client (maquette 13 l.218-229, 730-731) : « Sert » seul, texte `resume_client`. */
function ClientComponentFiche({
  item,
  onComment,
}: {
  item: Component;
  onComment: Shared["onComment"];
}) {
  return (
    <div className="flex flex-col gap-3">
      <ComponentFicheHeader
        id={item.id}
        name={item.name}
        pill={<TypePill type={item.type} className="shrink-0" />}
        action={
          onComment ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => onComment({ kind: "component", ref: item.id, name: item.name })}
            >
              <Icon name="add_comment" size={16} />
              Commenter
            </Button>
          ) : null
        }
      />
      <p className="m-0 whitespace-pre-line break-words text-body leading-[1.55]">
        {item.summary.length > 0 ? item.summary.join("\n") : CLIENT_SUMMARY_MISSING}
      </p>
      {item.serves.length > 0 ? (
        <section aria-label={CLIENT_SERVES_LABEL} className="flex flex-col gap-1.5">
          <span className="font-semibold text-caption text-muted-foreground uppercase tracking-wide">
            {CLIENT_SERVES_LABEL}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {item.serves.map((link) => (
              <EntityChip key={link.id} kind="feature" id={link.id} title={link.label} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

const renderNode = (
  node: ArchNode,
  context: { selected: boolean; ghost: boolean; compact: boolean; onSelect: () => void },
) => (
  <ArchNodeCard
    kind={node.kind}
    name={node.name}
    subtitle={node.subtitle}
    selected={context.selected}
    ghost={context.ghost}
    compact={context.compact}
    onSelect={context.onSelect}
  />
);

const BANDS = bandsOf();

/** Les composants du client, en un seul détail de zone : nœuds, liens et positions du schéma de l'équipe. */
function detailOf(model: ClientModel): ArchZoneDetail {
  return {
    zone: { id: "tout", name: "Tout" },
    components: model.items.map((item) => ({ specId: item.id, name: item.name, type: item.type })),
    relations: model.items.flatMap((item) =>
      item.dependsOn.map((link) => ({
        from: item.id,
        to: link.id,
        via: link.via,
        async: link.async,
      })),
    ),
    actors: [],
    outgoing: [],
  };
}

/** Onglet Schéma du client : même lecteur que l'équipe, sans YAML ni Mermaid ; fiche « Sert » et « Commenter ». */
export function ClientSchema({ model, url, onComment }: Shared & { model: ClientModel }) {
  const zoom = useDiagramZoom();
  const fullscreen = useDiagramFullscreen();
  const detail = useMemo(() => detailOf(model), [model]);
  const nodes = useMemo(() => nodesOf([detail]), [detail]);
  const relations = useMemo(() => relationsOf([detail], nodes), [detail, nodes]);
  const positions = useMemo(() => positionsOf(nodes, model.positions), [nodes, model.positions]);
  const selected = model.items.find((item) => item.id === url.sel);
  if (model.items.length === 0) {
    return (
      <EmptyState
        variant="inline"
        bordered
        icon="hub"
        title="Aucun composant à afficher"
        description="Le schéma se remplit dès que l'équipe a enregistré des composants."
      />
    );
  }
  return (
    <div className="flex flex-wrap gap-4 xl:flex-nowrap">
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-2.5">
        <p className="m-0 text-caption font-normal text-muted-foreground">
          Cliquez un composant pour voir ce qu'il fait.
        </p>
        <DiagramViewer<ArchNode>
          label="Schéma d'architecture"
          nodes={nodes}
          relations={relations}
          bands={BANDS}
          renderNode={renderNode}
          selectedId={selected?.id ?? null}
          onSelect={url.select}
          positions={positions}
          initialZoom={zoom.initialZoom}
          onZoomChange={zoom.onZoomChange}
          minimap
          fullscreen={fullscreen}
          className={VIEWER_HEIGHT}
        />
      </div>
      {selected ? (
        <FicheFrame
          id={selected.id}
          onClose={url.dropSelection}
          label="Fiche du composant"
          description="Ce que fait le composant choisi dans le schéma."
        >
          <ClientComponentFiche item={selected} onComment={onComment} />
        </FicheFrame>
      ) : null}
    </div>
  );
}

/** Onglet Composants du client : nom, type, zone et ce que fait le composant ; « Commenter » par ligne. */
export function ClientComponents({
  model,
  onComment,
}: Pick<Shared, "onComment"> & { model: ClientModel }) {
  if (model.items.length === 0) {
    return (
      <EmptyState
        variant="inline"
        bordered
        icon="widgets"
        title="Aucun composant"
        description="L'équipe n'a pas encore enregistré de composant."
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <CountBar
        total={model.items.length}
        loaded={model.items.length}
        noun={COMPONENT_NOUN}
        showAllLoaded
      />
      {model.truncated ? (
        <InlineAlert variant="neutral" icon="info" role="note">
          {CLIENT_TRUNCATED_NOTE(model.items.length)}
        </InlineAlert>
      ) : null}
      <Table
        framed
        frameLabel="Composants de l'architecture"
        aria-label="Composants de l'architecture"
      >
        <TableHeader>
          <TableRow>
            <TableHead>Composant</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Zone</TableHead>
            <TableHead>Ce que ça fait</TableHead>
            {onComment ? <TableHead>Commentaire</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {model.items.map((item) => (
            <TableRow key={item.id} data-spec-id={item.id}>
              <TableHead
                scope="row"
                className="whitespace-nowrap text-body font-medium text-foreground"
              >
                <span className="flex items-center gap-2">
                  <IdTag>{item.id}</IdTag>
                  {item.name}
                </span>
              </TableHead>
              <TableCell>
                <span className="text-meta">{componentTypeLabel(item.type)}</span>
              </TableCell>
              <TableCell className="whitespace-nowrap text-meta text-muted-foreground">
                {item.zone ?? ""}
              </TableCell>
              <TableCell className="max-w-[420px] text-meta">
                {item.summary[0] ?? CLIENT_SUMMARY_MISSING}
              </TableCell>
              {onComment ? (
                <TableCell>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Commenter ${item.id}, ${item.name}`}
                    onClick={() => onComment({ kind: "component", ref: item.id, name: item.name })}
                  >
                    <Icon name="add_comment" size={16} />
                    Commenter
                  </Button>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Pied de liste du client : pages de 50, suite chargée à la demande ou en approchant du bas. */
function ClientFooter({
  list,
  noun,
}: {
  list: ClientDecisions | ClientFlows;
  noun: typeof DECISION_NOUN | typeof FLOW_NOUN;
}) {
  const footer = useListFooter(list, () => orpc.clientSpace.key());
  const sentinel = useAutoLoad(footer.onLoadMore, footer.state === "more");
  return (
    <div ref={sentinel}>
      <ListFooter
        attached
        state={footer.state}
        pageSize={CLIENT_PAGE_SIZE}
        loadedCount={list.items.length}
        total={list.total}
        noun={noun}
        longList={footer.longList}
        onLoadMore={footer.onLoadMore}
        onRetry={footer.onRetry}
        onBackToTop={() => window.scrollTo({ top: 0 })}
      />
    </div>
  );
}

function ListLoading() {
  return <Skeleton aria-busy="true" className="h-64 rounded-xl" />;
}

function DecisionFicheOf({
  projectId,
  id,
  onComment,
}: { projectId: string; id: string } & Pick<Shared, "onComment">) {
  const query = useClientDecision(projectId, id);
  if (query.isPending) return <ListLoading />;
  if (query.isError || !query.data) {
    return (
      <ErrorNotice title="Impossible de charger la décision" onRetry={() => void query.refetch()}>
        La décision n'a pas pu être lue.
      </ErrorNotice>
    );
  }
  const { data } = query;
  return (
    <ArchitectureDecisionFiche
      data={data}
      onComment={
        onComment ? () => onComment({ kind: "adr", ref: data.id, name: data.title }) : undefined
      }
    />
  );
}

/** État vide des décisions du client : filtre sans résultat (avec « Effacer les filtres ») ou aucune décision. */
function ClientDecisionsEmpty({
  url,
  controls,
  filtered,
}: {
  url: ArchitectureUrlModel;
  controls: ReactNode;
  filtered: boolean;
}) {
  return filtered ? (
    <div className="flex flex-col gap-3">
      {controls}
      <EmptyState
        variant="inline"
        bordered
        icon="search_off"
        title={
          url.q ? `Aucune décision ne correspond à « ${url.q} »` : "Aucune décision pour ce filtre."
        }
        description="La recherche et les filtres portent sur toutes les décisions du projet."
        action={
          <Button variant="outline" size="sm" onClick={url.clearDecisionFilters}>
            Effacer les filtres
          </Button>
        }
      />
    </div>
  ) : (
    <EmptyState
      variant="inline"
      bordered
      icon="gavel"
      title="Aucune décision"
      description="L'équipe n'a pas encore enregistré de décision d'architecture."
    />
  );
}

/** Onglet Décisions du client : liste de 50 par page, fiche avec « En clair » (B589) et « Commenter ». */
/** Recherche et puce Statut de la vue client (maquette 13 l.379 et l.552) : ni Date ni Composant, l'entrée n'en a pas. */
function ClientDecisionsToolbar({ url }: { url: ArchitectureUrlModel }) {
  const search = useSearchBox(url);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchField
        ref={search.inputRef}
        label={DECISIONS_SEARCH_LABEL}
        placeholder={DECISIONS_SEARCH_PLACEHOLDER}
        name="q"
        autoComplete="off"
        maxLength={200}
        className="min-w-0 flex-1 basis-[200px] [&_input]:h-8 max-md:[&_input]:h-11"
        value={search.text}
        onChange={(event) => search.onChange(event.target.value)}
      />
      <FilterChipMenu
        label="Statut"
        allLabel="Tous les statuts"
        value={url.status}
        options={ADR_STATUS_PARAMS.map((value) => ({ value, label: STATUS_LABELS[value] }))}
        onChange={(value) => url.setStatus(value as AdrStatusParam | null)}
      />
      {url.status || url.q ? (
        <Button
          variant="ghost"
          size="sm"
          className="max-md:h-11"
          onClick={url.clearDecisionFilters}
        >
          Effacer les filtres
        </Button>
      ) : null}
    </div>
  );
}

/** Onglet Décisions du client : recherche, puce Statut, liste de 50 par page, fiche avec « En clair » (B589) et « Commenter ». */
export function ClientDecisionsTab({
  projectId,
  decisions,
  url,
  onComment,
}: Shared & { projectId: string; decisions: ClientDecisions }) {
  if (decisions.query.isError && decisions.items.length === 0) {
    return (
      <ErrorNotice
        title="Impossible de charger les décisions"
        onRetry={() => void decisions.query.refetch()}
      >
        Les décisions n'ont pas pu être lues. Réessayez dans un instant.
      </ErrorNotice>
    );
  }
  if (decisions.query.isPending) return <ListLoading />;
  const filtered = Boolean(url.status || url.q);
  const controls = (
    <>
      <ClientDecisionsToolbar url={url} />
      <CountBar
        total={decisions.total}
        loaded={decisions.items.length}
        noun={DECISION_NOUN}
        {...(url.q ? { query: url.q } : {})}
        busy={decisions.stale}
      />
    </>
  );
  if (decisions.items.length === 0) {
    return <ClientDecisionsEmpty url={url} controls={controls} filtered={filtered} />;
  }
  const current = url.d ?? decisions.items[0]?.id;
  return (
    <div className="flex flex-wrap items-start gap-6">
      <div
        className={cn(
          "flex min-w-[280px] flex-[1_1_420px] flex-col gap-3 md:max-w-[520px]",
          url.d && "max-md:hidden",
        )}
      >
        {controls}
        <ArchitectureDecisionList
          rows={decisions.items}
          selected={current}
          onSelect={url.selectDecision}
          footer={<ClientFooter list={decisions} noun={DECISION_NOUN} />}
        />
      </div>
      {current ? (
        <div
          className={cn(
            "flex min-w-0 flex-[999_1_480px] flex-col gap-3",
            !url.d && "max-md:hidden",
          )}
        >
          <BackToList onClick={() => url.selectDecision(null)} />
          <DecisionFicheOf key={current} projectId={projectId} id={current} onComment={onComment} />
        </div>
      ) : null}
    </div>
  );
}

function FlowDetailOf({
  projectId,
  id,
  onComment,
}: { projectId: string; id: string } & Pick<Shared, "onComment">) {
  const query = useClientFlow(projectId, id);
  if (query.isPending) return <ListLoading />;
  if (query.isError || !query.data) {
    return (
      <ErrorNotice title="Impossible de charger le flux" onRetry={() => void query.refetch()}>
        Le flux n'a pas pu être lu.
      </ErrorNotice>
    );
  }
  const { data } = query;
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <FlowHeading id={id} title={data.title} />
        <span className="flex-1" />
        {onComment ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => onComment({ kind: "archflow", ref: id, name: data.title })}
          >
            <Icon name="add_comment" size={16} />
            Commenter
          </Button>
        ) : null}
      </div>
      <SequenceDiagram title={data.title} participants={data.participants} items={data.items} />
    </>
  );
}

/** Onglet Flux du client (maquette 13 l.402-441, sans sélecteur YAML ni Mermaid) : liste puis séquence. */
export function ClientFlowsTab({
  projectId,
  flows,
  url,
  onComment,
}: Shared & { projectId: string; flows: ClientFlows }) {
  if (flows.query.isError && flows.items.length === 0) {
    return (
      <ErrorNotice
        title="Impossible de charger les flux"
        onRetry={() => void flows.query.refetch()}
      >
        Les flux n'ont pas pu être lus. Réessayez dans un instant.
      </ErrorNotice>
    );
  }
  if (flows.query.isPending) return <ListLoading />;
  if (flows.items.length === 0) {
    return (
      <EmptyState
        variant="inline"
        bordered
        icon="swap_horiz"
        title="Aucun flux"
        description="L'équipe n'a pas encore enregistré de flux."
      />
    );
  }
  const current = url.f ?? flows.items[0]?.specId;
  return (
    <div className="flex flex-wrap gap-6">
      <div
        className={cn(
          "flex min-w-[260px] flex-[0_1_320px] flex-col gap-2.5",
          url.f && "max-md:hidden",
        )}
      >
        <CountBar
          total={flows.total}
          loaded={flows.items.length}
          noun={FLOW_NOUN}
          showAllLoaded
          busy={flows.stale}
        />
        <ListPanel label="Flux de l'architecture" className="max-h-[760px] overflow-auto">
          {flows.items.map((row) => (
            <FlowRow
              key={row.specId}
              row={row}
              selected={row.specId === current}
              onSelect={() => url.selectFlow(row.specId)}
            />
          ))}
        </ListPanel>
        <ClientFooter list={flows} noun={FLOW_NOUN} />
      </div>
      {current ? (
        <div
          className={cn(
            "flex min-w-0 flex-[999_1_560px] flex-col gap-3",
            !url.f && "max-md:hidden",
          )}
        >
          <BackToList onClick={() => url.selectFlow(null)} />
          <FlowDetailOf key={current} projectId={projectId} id={current} onComment={onComment} />
        </div>
      ) : null}
    </div>
  );
}
