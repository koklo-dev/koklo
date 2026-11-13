"use client";

import {
  Button,
  CountBar,
  type CountNoun,
  DiagramMinimap,
  EmptyState,
  formatCount,
  GroupSection,
  LifecycleStatus,
  ListFooter,
  ListPanel,
  type PageSize,
  Pagination,
  VirtualList,
  ZoneNode,
} from "@koklo/ui";
import { useEffect, useRef, useState } from "react";
import { DevUiFrame, DevUiNote, DevUiSection } from "./dev-ui-frame.tsx";
import {
  DEMO_ZONES,
  type DemoFeature,
  demoFeature,
  demoFeatures,
  LIST_PAGE,
  LIST_TOTAL,
  MINIMAP,
} from "./dev-ui-lists-data.ts";

const NOUN: CountNoun = { one: "fonctionnalité", other: "fonctionnalités" };
const noop = () => undefined;

function FeatureRow({ feature }: { feature: DemoFeature }) {
  return (
    <>
      <span className="w-14 shrink-0 font-mono text-code text-muted-foreground">{feature.id}</span>
      <span className="min-w-0 flex-1 truncate text-body">{feature.title}</span>
      <LifecycleStatus stage={feature.stage} className="hidden sm:inline-flex" />
    </>
  );
}

/** 1 000 lignes fictives : une page de 50 « arrive » 400 ms après la demande, sans réseau. */
function VirtualDemo() {
  const [loaded, setLoaded] = useState(LIST_PAGE);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => clearTimeout(timer.current ?? undefined), []);
  const items = demoFeatures(loaded);
  const hasMore = loaded < LIST_TOTAL;

  const loadMore = () => {
    if (loading || !hasMore) return;
    setLoading(true);
    timer.current = setTimeout(() => {
      setLoaded((count) => Math.min(LIST_TOTAL, count + LIST_PAGE));
      setLoading(false);
    }, 400);
  };
  const state = loading ? "loading" : hasMore ? "more" : "end";
  return (
    <>
      <CountBar
        total={LIST_TOTAL}
        loaded={loaded}
        noun={NOUN}
        filterLabel="31 à valider"
        sort="identifiant"
      />
      <VirtualList
        className="h-[420px]"
        framed
        loadingRows={loading ? 4 : 0}
        label="Fonctionnalités (exemple)"
        items={items}
        total={LIST_TOTAL}
        getItemKey={(feature) => feature.id}
        renderItem={(feature) => <FeatureRow feature={feature} />}
        selectedKey={demoFeature(2).id}
        hasMore={hasMore}
        isLoadingMore={loading}
        onLoadMore={loadMore}
        footer={
          <ListFooter
            state={state}
            pageSize={LIST_PAGE}
            total={LIST_TOTAL}
            noun={NOUN}
            longList
            onLoadMore={loadMore}
            onBackToTop={noop}
          />
        }
      />
    </>
  );
}

function Counts() {
  return (
    <DevUiFrame title="CountBar" wide>
      <DevUiNote>Liste complète, avec compteur de filtre et tri</DevUiNote>
      <CountBar
        total={LIST_TOTAL}
        loaded={LIST_PAGE}
        noun={NOUN}
        filterLabel="31 à valider"
        sort="identifiant"
      />
      <DevUiNote>Liste filtrée, tout est chargé</DevUiNote>
      <CountBar total={12} loaded={12} noun={NOUN} filterLabel="5 à valider" />
      <DevUiNote>Recherche sans résultat</DevUiNote>
      <CountBar total={0} loaded={0} noun={NOUN} query="annulation groupée" />
      <DevUiNote>Version de colonne (kanban) : le total seul</DevUiNote>
      <CountBar total={142} loaded={30} noun={NOUN} compact />
    </DevUiFrame>
  );
}

function Footers() {
  return (
    <DevUiFrame title="ListFooter" wide>
      <div className="grid gap-4 md:grid-cols-2">
        <ListFooter
          state="more"
          pageSize={LIST_PAGE}
          className="rounded-lg border"
          onLoadMore={noop}
        />
        <ListFooter state="loading" pageSize={LIST_PAGE} className="rounded-lg border" />
        <ListFooter
          framed
          state="more"
          pageSize={6}
          noun={{ one: "parcours", other: "parcours", masculine: true }}
          onLoadMore={noop}
        />
        <ListFooter
          state="error"
          pageSize={LIST_PAGE}
          loadedCount={100}
          className="rounded-lg border"
          onRetry={noop}
        />
        <ListFooter
          state="end"
          total={LIST_TOTAL}
          noun={NOUN}
          longList
          className="rounded-lg border"
          onBackToTop={noop}
        />
      </div>
      <DevUiNote>Pied de colonne du kanban, un état par ligne</DevUiNote>
      <div className="grid gap-2 md:grid-cols-2">
        <ListFooter variant="compact" state="more" remaining={112} onLoadMore={noop} />
        <ListFooter variant="compact" state="loading" />
        <ListFooter variant="compact" state="error" onRetry={noop} />
        <ListFooter variant="compact" state="end" endLabel="Fin de la colonne" />
      </div>
    </DevUiFrame>
  );
}

function Paginations() {
  const [size, setSize] = useState<PageSize>(25);
  const common = { size, total: 1240, onPageChange: noop, onSizeChange: setSize };
  return (
    <DevUiFrame title="Pagination" wide>
      <Pagination {...common} page={1} />
      <Pagination {...common} page={20} />
      <Pagination {...common} page={50} />
      <Pagination
        page={2}
        size={25}
        total={100}
        density="sm"
        onPageChange={noop}
        aria-label="Pagination dense"
      />
    </DevUiFrame>
  );
}

function Groups() {
  return (
    <DevUiFrame title="GroupSection" wide>
      <GroupSection
        label="Fonctionnalités · Réservation"
        counts="42 · 18 acceptées · 22 à relire"
        headingLevel={4}
        defaultOpen
        action={{ label: "Accepter les 22 restantes", onClick: noop }}
        actionIcon="done_all"
        remaining={34}
        onShowMore={noop}
      >
        <ul>
          {demoFeatures(8).map((feature) => (
            <li key={feature.id} className="flex h-11 items-center gap-3 border-b px-4">
              <FeatureRow feature={feature} />
            </li>
          ))}
        </ul>
      </GroupSection>
      <GroupSection
        label="Règles · Paiement"
        counts="18 · 0 acceptée · 18 à relire"
        headingLevel={4}
      >
        <p className="px-4 py-3 text-meta">Groupe replié.</p>
      </GroupSection>
    </DevUiFrame>
  );
}

function StackedGroups() {
  return (
    <DevUiFrame title="GroupSection empilés" wide>
      <DevUiNote>Groupes dans un seul cadre, séparés par une bordure basse</DevUiNote>
      <ListPanel label="Groupes de fonctionnalités">
        <li>
          <GroupSection
            variant="stacked"
            label="Fonctionnalités · Paiement"
            counts="36 · 30 acceptées · 6 à relire"
            headingLevel={4}
            defaultOpen
            action={{ label: "Accepter les 6 restantes", onClick: noop }}
            actionIcon="done_all"
            remaining={28}
            onShowMore={noop}
          >
            <ul>
              {demoFeatures(4).map((feature) => (
                <li key={feature.id} className="flex h-11 items-center gap-3 border-t pr-3.5 pl-10">
                  <FeatureRow feature={feature} />
                </li>
              ))}
            </ul>
          </GroupSection>
        </li>
        <li>
          <GroupSection
            variant="stacked"
            label="Règles métier"
            counts="58 · 22 acceptées · 12 à relire"
            headingLevel={4}
            action={{ label: "Accepter les 12 restantes", onClick: noop }}
            actionIcon="done_all"
          >
            <p className="px-4 py-3 text-meta">Groupe replié.</p>
          </GroupSection>
        </li>
      </ListPanel>
    </DevUiFrame>
  );
}

function Diagrams() {
  return (
    <>
      <DevUiFrame title="ZoneNode">
        <div className="grid gap-3">
          {DEMO_ZONES.map((zone, index) => (
            <ZoneNode
              key={zone.name}
              name={zone.name}
              icon={index === 0 ? "table" : "account_tree"}
              count={zone.count}
              countLabel="tables"
              preview={zone.preview}
              links={zone.links}
              current={index === 0}
              onOpen={noop}
            />
          ))}
          {/* Variante du diagramme des Données (maquette 11, B478) : 7 noms, flèche, « cliquez pour ouvrir ». */}
          <ZoneNode
            name="Paiement et caisse"
            icon="folder_open"
            count={14}
            countLabel="tables"
            detail="cliquez pour ouvrir"
            preview={[
              "paiement",
              "facture",
              "ligne_facture",
              "remboursement",
              "avoir",
              "acompte",
              "caisse",
              "cloture",
            ]}
            previewLimit={7}
            arrow
            onOpen={noop}
          />
        </div>
      </DevUiFrame>
      <DevUiFrame title="DiagramMinimap">
        <div className="relative h-[220px] rounded-lg border bg-surface">
          <DiagramMinimap {...MINIMAP} onNavigate={noop} />
        </div>
        <DevUiNote>
          Cadre de la vue en --primary ; cliquer ou utiliser les flèches déplace la vue.
        </DevUiNote>
      </DevUiFrame>
    </>
  );
}

/** Section « Listes longues » de la galerie (S-dev-ui §3, DESIGN.md v2.1 §5.3). */
export function DevUiLists() {
  return (
    <DevUiSection id="dev-ui-lists" title="Listes longues">
      <DevUiFrame title="VirtualList" wide>
        <DevUiNote>
          1 000 fonctionnalités fictives, 50 par page : la suivante arrive à 80 % du défilement.
        </DevUiNote>
        <VirtualDemo />
      </DevUiFrame>
      <Counts />
      <Footers />
      <DevUiFrame title="Recherche sans résultat">
        <ListPanel label="Recherche sans résultat">
          <li>
            <EmptyState
              variant="inline"
              icon="search_off"
              title="Aucune fonctionnalité ne correspond à « annulation groupée »"
              description={`La recherche porte sur les ${formatCount(LIST_TOTAL)} fonctionnalités, pas seulement celles affichées.`}
              action={
                <Button variant="outline" size="sm" onClick={noop}>
                  Effacer la recherche
                </Button>
              }
            />
          </li>
        </ListPanel>
        <DevUiNote>EmptyState inline bordered (état vide qui remplace la liste)</DevUiNote>
        <EmptyState
          variant="inline"
          bordered
          icon="search_off"
          title="Aucune fonctionnalité ne correspond à ces filtres."
          description="Modifiez ou effacez les filtres pour revoir la liste."
        />
      </DevUiFrame>
      <Paginations />
      <Groups />
      <StackedGroups />
      <Diagrams />
    </DevUiSection>
  );
}
