"use client";

import {
  Button,
  CountBar,
  cn,
  EmptyState,
  EntityChip,
  Icon,
  ListFooter,
  ListPanel,
  Pill,
  SegmentedControl,
  SequenceDiagram,
  Skeleton,
} from "@koklo/ui";
import { useState } from "react";
import { FLOW_NOUN } from "../lib/architecture-labels.ts";
import { orpc } from "../lib/orpc.ts";
import {
  FLOWS_PAGE_SIZE,
  useArchitectureFlow,
  useArchitectureFlows,
  useFlowSource,
} from "../lib/use-architecture-flows.ts";
import type { ArchitecturePageModel } from "../lib/use-architecture-page.ts";
import { useAutoLoad } from "../lib/use-auto-load.ts";
import { useListFooter } from "../lib/use-features-list.ts";
import { FlowHeading, FlowRow } from "./architecture-flow-parts.tsx";
import { SourceBlock } from "./data-diagram-source.tsx";
import { ErrorNotice } from "./error-notice.tsx";
import { GitReadError } from "./git-read-error.tsx";

type View = "diagram" | "yaml" | "mermaid";
const VIEWS = [
  { value: "diagram", label: "Diagramme" },
  { value: "yaml", label: "YAML" },
  { value: "mermaid", label: "Mermaid" },
] as const;

const YAML_NOTE =
  "Un fichier par flux : c'est ce que l'agent lit et modifie. Le diagramme et le Mermaid en sont dérivés.";
const MERMAID_NOTE = "Régénéré à chaque enregistrement depuis le fichier YAML du flux.";

/** Texte brut d'un flux : YAML (« Source de vérité » ou « Généré ») ou Mermaid (« Généré »). */
function FlowSource({
  projectId,
  flowId,
  format,
}: {
  projectId: string;
  flowId: string;
  format: "yaml" | "mermaid";
}) {
  const source = useFlowSource(projectId, flowId, format, true);
  if (source.isPending) return <Skeleton aria-busy="true" className="h-40 rounded-[10px]" />;
  if (source.isError || !source.data) {
    return (
      <GitReadError
        error={source.error}
        onRetry={() => void source.refetch()}
        retrying={source.isFetching}
        fallback="Le fichier du flux n'a pas pu être lu."
      />
    );
  }
  const { path, text, generated } = source.data;
  const yaml = format === "yaml";
  return (
    <SourceBlock
      icon={yaml ? "description" : "schema"}
      path={path}
      maxHeight={640}
      label={yaml ? "YAML du flux" : "Mermaid du flux"}
      code={text}
      note={yaml ? YAML_NOTE : MERMAID_NOTE}
      tag={
        <Pill size="md" tone={yaml && !generated ? "success" : "soft"}>
          {yaml && !generated ? "Source de vérité" : "Généré"}
        </Pill>
      }
    />
  );
}

const refKind = { feature: "feature", rule: "rule", decision: "decision" } as const;

/** Liens du flux : fonctionnalités, règles et décisions, en pastilles (maquette 13 l.434). */
function FlowLinks({
  features,
  rules,
  decisions,
}: {
  features: readonly string[];
  rules: readonly string[];
  decisions: readonly string[];
}) {
  const chips = [
    ...features.map((id) => ({ id, kind: refKind.feature })),
    ...rules.map((id) => ({ id, kind: refKind.rule })),
    ...decisions.map((id) => ({ id, kind: refKind.decision })),
  ];
  if (chips.length === 0) return null;
  return (
    <section aria-label="Liens du flux" className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <EntityChip key={chip.id} kind={chip.kind} id={chip.id} />
        ))}
      </div>
    </section>
  );
}

/** Méta du flux (maquette 13 l.608) : acteur, composants et externes. */
function metaOf(data: { actor: string; participants: readonly { type: string }[] }): string {
  const external = data.participants.filter((p) => p.type === "ext").length;
  const components = data.participants.filter((p) => p.type !== "ext" && p.type !== "actor").length;
  return `${data.actor} · ${components} ${components > 1 ? "composants" : "composant"}, ${external} ${external > 1 ? "externes" : "externe"}`;
}

/** Détail d'un flux (maquette 13 l.414-440) : identifiant, titre, acteur, sélecteur, diagramme ou source, liens. */
function FlowDetail({ page, flowId }: { page: ArchitecturePageModel; flowId: string }) {
  const [view, setView] = useState<View>("diagram");
  const flow = useArchitectureFlow(page.projectId, flowId);
  const { data } = flow;
  return (
    <div
      className={cn(
        "flex min-w-0 flex-[999_1_560px] flex-col gap-3",
        !page.url.f && "max-md:hidden",
      )}
    >
      <button
        type="button"
        onClick={() => page.url.selectFlow(null)}
        className="inline-flex h-11 items-center gap-1.5 self-start rounded-md px-1 font-medium text-primary text-meta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
      >
        <Icon name="chevron_left" size={18} />
        Liste
      </button>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <FlowHeading id={flowId} title={data?.title ?? flowId} />
        {data ? <span className="text-meta text-muted-foreground">{metaOf(data)}</span> : null}
        <span className="flex-1" />
        {page.form.canWrite && data ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => page.form.openEdit(flowId)}
          >
            Modifier
          </Button>
        ) : null}
        <SegmentedControl<View>
          aria-label="Affichage du flux"
          options={VIEWS}
          value={view}
          onValueChange={setView}
        />
      </div>
      {flow.isPending ? <Skeleton aria-busy="true" className="h-64 rounded-xl" /> : null}
      {flow.isError ? (
        <ErrorNotice title="Impossible de charger le flux" onRetry={() => void flow.refetch()}>
          Le flux n'a pas pu être lu.
        </ErrorNotice>
      ) : null}
      {data && view === "diagram" ? (
        <>
          <SequenceDiagram title={data.title} participants={data.participants} items={data.items} />
          <FlowLinks features={data.features} rules={data.rules} decisions={data.decisions} />
        </>
      ) : null}
      {data && view !== "diagram" ? (
        <FlowSource projectId={page.projectId} flowId={flowId} format={view} />
      ) : null}
    </div>
  );
}

/** Liste des flux (maquette 13 l.407-412) : une ligne par parcours, 50 par page, suite au défilement. */
function FlowList({
  page,
  flows,
  current,
}: {
  page: ArchitecturePageModel;
  flows: ReturnType<typeof useArchitectureFlows>;
  current: string | undefined;
}) {
  const footer = useListFooter(flows, () => orpc.spec.architecture.flows.key());
  const sentinel = useAutoLoad(footer.onLoadMore, footer.state === "more");
  return (
    <div
      className={cn(
        "flex min-w-[260px] flex-[0_1_320px] flex-col gap-2.5",
        page.url.f && "max-md:hidden",
      )}
    >
      <CountBar
        total={flows.total}
        loaded={flows.items.length}
        noun={FLOW_NOUN}
        scope="un par parcours"
        showAllLoaded
        busy={flows.stale}
      />
      <ListPanel label="Flux de l'architecture" className="max-h-[760px] overflow-auto">
        {flows.items.map((row) => (
          <FlowRow
            key={row.specId}
            row={row}
            selected={row.specId === current}
            onSelect={() => page.url.selectFlow(row.specId)}
          />
        ))}
      </ListPanel>
      <div ref={sentinel}>
        <ListFooter
          attached
          state={footer.state}
          pageSize={FLOWS_PAGE_SIZE}
          loadedCount={flows.items.length}
          total={flows.total}
          noun={FLOW_NOUN}
          longList={footer.longList}
          onLoadMore={footer.onLoadMore}
          onRetry={footer.onRetry}
          onBackToTop={() => window.scrollTo({ top: 0 })}
        />
      </div>
    </div>
  );
}

/**
 * Onglet Flux (maquette 13 l.405-441) : liste des flux (un par parcours, 50 par page), puis le flux choisi en
 * diagramme de séquence, en YAML ou en Mermaid (équipe et designer ; le client n'a pas cet onglet). Sous 768 px, la
 * liste puis le détail avec « Liste » pour revenir.
 */
export function ArchitectureFlowsTab({ page }: { page: ArchitecturePageModel }) {
  const flows = useArchitectureFlows(page.projectId, page.url.f, page.team);
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
  if (flows.query.isPending) return <Skeleton aria-busy="true" className="h-64 rounded-xl" />;
  if (flows.items.length === 0) {
    return (
      <EmptyState
        variant="inline"
        bordered
        icon="swap_horiz"
        title="Aucun flux"
        description="Aucun flux. Un flux se propose par parcours."
      />
    );
  }
  const current = page.url.f ?? flows.items[0]?.specId;
  return (
    <div className="flex flex-wrap gap-6">
      <FlowList page={page} flows={flows} current={current} />
      {current ? <FlowDetail key={current} page={page} flowId={current} /> : null}
    </div>
  );
}
