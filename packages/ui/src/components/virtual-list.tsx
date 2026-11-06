"use client";

import {
  defaultRangeExtractor,
  observeElementRect,
  type Range,
  useVirtualizer,
  type Virtualizer,
} from "@tanstack/react-virtual";
import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "../lib/cn.ts";

/** Hauteurs de ligne de DESIGN.md v2.1 §5.3 : 52 px pour les listes, 44 px pour la relecture. */
export type RowHeight = 52 | 44;

/** Marge de lignes rendues de chaque côté de la fenêtre. */
const OVERSCAN = 10;
/** La page suivante est demandée à 80 % du défilement ; les précédentes à 20 %. */
const LOAD_NEXT_AT = 0.8;
const LOAD_PREVIOUS_AT = 0.2;
/** Fenêtre supposée tant que le conteneur n'a aucune hauteur mesurée (rendu serveur, onglet caché). */
const FALLBACK_ROWS = 10;

export interface VirtualRow {
  /** Rang dans les éléments chargés (0 pour le premier). */
  index: number;
  /** Rang réel dans la liste du serveur, à partir de 1. */
  position: number;
  selected: boolean;
}

export interface VirtualListProps<T> {
  items: readonly T[];
  /** Total du serveur : `aria-setsize`, jamais le nombre chargé. */
  total: number;
  /** Rang (à partir de 0) du premier élément chargé dans la liste du serveur : `offset` de `around`. */
  startIndex?: number;
  getItemKey: (item: T) => string;
  renderItem: (item: T, row: VirtualRow) => ReactNode;
  /** Nom de la liste. */
  label: string;
  rowHeight?: RowHeight;
  className?: string;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  hasPrevious?: boolean;
  onLoadPrevious?: () => void;
  selectedKey?: string;
  /** Amène cette ligne au centre (lien direct `?sel=`). */
  centerOnKey?: string;
  /** Position à restaurer au retour d'une fiche. */
  initialScrollOffset?: number;
  onScrollOffsetChange?: (offset: number) => void;
  /** Entrée, Espace ou clic sur une ligne. */
  onActivate?: (item: T) => void;
  /** Rechargement en cours (`aria-busy`). */
  busy?: boolean;
  /** Pied de liste, rendu sous la liste dans la zone défilante. */
  footer?: ReactNode;
}

/** `observeElementRect` qui retombe sur une fenêtre de 10 lignes quand le conteneur mesure 0 px. */
function fallbackRect(height: number): typeof observeElementRect {
  return (instance, callback) =>
    observeElementRect(instance, (rect) =>
      callback(rect.height === 0 ? { width: rect.width, height } : rect),
    );
}

/** Demande la page voisine une seule fois par état de liste, quand la sentinelle devient visible. */
function useSentinel(
  scroller: RefObject<HTMLDivElement | null>,
  which: "start" | "end",
  enabled: boolean,
  signature: string,
  request: (() => void) | undefined,
) {
  const requested = useRef("");
  useEffect(() => {
    const target = scroller.current?.querySelector(`[data-sentinel='${which}']`);
    // Sans IntersectionObserver (rendu serveur, vieux navigateur) : « Charger la suite » reste le repli.
    if (!enabled || !target || !request || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        if (requested.current === signature) return;
        requested.current = signature;
        request();
      },
      { root: scroller.current, threshold: 0 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [scroller, which, enabled, signature, request]);
}

/** Quand des lignes sont ajoutées au-dessus, la position de défilement suit pour que rien ne saute. */
function useKeepPositionOnPrepend(
  scroller: RefObject<HTMLDivElement | null>,
  startIndex: number,
  rowHeight: number,
) {
  const previous = useRef(startIndex);
  useLayoutEffect(() => {
    const added = previous.current - startIndex;
    previous.current = startIndex;
    if (added > 0 && scroller.current) scroller.current.scrollTop += added * rowHeight;
  }, [scroller, startIndex, rowHeight]);
}

interface Roving<T> {
  items: readonly T[];
  getItemKey: (item: T) => string;
  activeKey: string | undefined;
  setActiveKey: (key: string) => void;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  listRef: RefObject<HTMLUListElement | null>;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore?: () => void;
  onActivate?: (item: T) => void;
}

/** Une seule entrée au clavier : flèches, Début et Fin déplacent le focus entre les lignes. */
function useRovingRows<T>(options: Roving<T>) {
  const { items, getItemKey, activeKey, setActiveKey, virtualizer, listRef } = options;
  const { hasMore, isLoadingMore, onLoadMore, onActivate } = options;
  const pending = useRef<string | null>(null);

  useEffect(() => {
    const key = pending.current;
    if (key === null || !listRef.current) return;
    const row = [...listRef.current.children].find(
      (el) => (el as HTMLElement).dataset.rowKey === key,
    );
    if (!row) return;
    pending.current = null;
    (row as HTMLElement).focus();
  });

  const focusIndex = (index: number) => {
    const item = items[index];
    if (item === undefined) return;
    const key = getItemKey(item);
    pending.current = key;
    setActiveKey(key);
    virtualizer.scrollToIndex(index);
  };

  const target = (key: string, index: number): number | null => {
    if (key === "ArrowUp") return Math.max(0, index - 1);
    if (key === "Home") return 0;
    if (key === "End") return items.length - 1;
    if (key !== "ArrowDown") return null;
    if (index + 1 < items.length) return index + 1;
    if (hasMore && !isLoadingMore) onLoadMore?.();
    return index;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>, index: number) => {
    const item = items[index];
    if (item === undefined) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onActivate?.(item);
      return;
    }
    const next = target(event.key, index);
    if (next === null) return;
    event.preventDefault();
    focusIndex(next);
  };

  return { activeKey, setActiveKey, onKeyDown };
}

/** La ligne active reste dans le DOM même hors de la fenêtre : le focus ne tombe pas quand elle défile. */
function keepActive(activeIndex: number) {
  return (range: Range) => {
    const indexes = defaultRangeExtractor(range);
    if (activeIndex < 0 || indexes.includes(activeIndex)) return indexes;
    return [...indexes, activeIndex].sort((a, b) => a - b);
  };
}

function useListVirtualizer<T>(
  props: VirtualListProps<T>,
  scroller: RefObject<HTMLDivElement | null>,
  activeIndex: number,
) {
  const { items, getItemKey, rowHeight = 52, centerOnKey, initialScrollOffset = 0 } = props;
  const fallback = FALLBACK_ROWS * rowHeight;
  const centerIndex = centerOnKey
    ? items.findIndex((item) => getItemKey(item) === centerOnKey)
    : -1;
  const firstOffset =
    centerIndex >= 0
      ? Math.max(0, centerIndex * rowHeight - (fallback - rowHeight) / 2)
      : initialScrollOffset;
  const observeRect = useMemo(() => fallbackRect(fallback), [fallback]);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => rowHeight,
    overscan: OVERSCAN,
    getItemKey: (index) => (items[index] === undefined ? index : getItemKey(items[index] as T)),
    initialOffset: firstOffset,
    observeElementRect: observeRect,
    rangeExtractor: keepActive(activeIndex),
  });
  // Une seule fois par clé : quand des pages s'ajoutent, le rang change mais la vue ne doit pas sauter.
  const centeredOn = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (centerIndex < 0 || centeredOn.current === centerOnKey) return;
    centeredOn.current = centerOnKey;
    virtualizer.scrollToIndex(centerIndex, { align: "center" });
  }, [centerOnKey, centerIndex, virtualizer]);
  return virtualizer;
}

/** État de la liste : ligne active, virtualiseur, clavier, sentinelles et position de défilement. */
function useVirtualListState<T>(props: VirtualListProps<T>) {
  const { items, startIndex = 0, getItemKey, rowHeight = 52, selectedKey } = props;
  const { hasMore = false, isLoadingMore = false, hasPrevious = false } = props;
  const scroller = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [chosenKey, setActiveKey] = useState<string | undefined>(undefined);
  const activeKey = chosenKey ?? selectedKey;
  const activeIndex =
    activeKey === undefined ? -1 : items.findIndex((item) => getItemKey(item) === activeKey);
  const virtualizer = useListVirtualizer(props, scroller, activeIndex);
  const roving = useRovingRows({
    ...props,
    activeKey,
    setActiveKey,
    virtualizer,
    listRef,
    hasMore,
    isLoadingMore,
  });
  const first = items[0] === undefined ? "" : getItemKey(items[0]);
  const signature = `${items.length}:${first}:${startIndex}`;
  useSentinel(scroller, "end", hasMore && !isLoadingMore, signature, props.onLoadMore);
  useSentinel(scroller, "start", hasPrevious, signature, props.onLoadPrevious);
  useKeepPositionOnPrepend(scroller, startIndex, rowHeight);
  const virtualItems = virtualizer.getVirtualItems();
  const tabKey = pickTabStop(
    virtualItems.map((v) => items[v.index]),
    getItemKey,
    roving.activeKey,
  );
  return { scroller, listRef, roving, virtualItems, tabKey, height: virtualizer.getTotalSize() };
}

/**
 * Liste virtualisée à hauteur de ligne fixe (DESIGN.md v2.1 §5.3, passation 07 §1.1 et §5) : seules les lignes visibles
 * et 10 de marge sont dans le DOM ; `aria-setsize` porte le total du serveur et `aria-posinset` le rang réel.
 */
export function VirtualList<T>(props: VirtualListProps<T>) {
  const { items, total, startIndex = 0, getItemKey, renderItem, label, rowHeight = 52 } = props;
  const { className, hasMore = false, hasPrevious = false, selectedKey, onActivate } = props;
  const { scroller, listRef, roving, virtualItems, tabKey, height } = useVirtualListState(props);
  return (
    <div
      ref={scroller}
      data-slot="virtual-list"
      className={cn("h-[520px] overflow-y-auto overscroll-contain", className)}
      onScroll={(event) => props.onScrollOffsetChange?.(event.currentTarget.scrollTop)}
    >
      <div className="relative" style={{ height }}>
        <ul
          ref={listRef}
          // biome-ignore lint/a11y/noRedundantRoles: `list-style: none` retire la sémantique de liste dans Safari / VoiceOver
          role="list"
          aria-label={label}
          aria-busy={props.busy || undefined}
          className="absolute inset-0"
        >
          {virtualItems.map((virtual) => {
            const item = items[virtual.index] as T;
            const key = getItemKey(item);
            const row = { index: virtual.index, position: startIndex + virtual.index + 1 };
            const selected = key === selectedKey;
            return (
              <Row
                key={key}
                rowKey={key}
                height={rowHeight}
                top={virtual.start}
                setSize={total}
                position={row.position}
                selected={selected}
                tabStop={key === tabKey}
                onFocusRow={() => roving.setActiveKey(key)}
                onActivate={() => onActivate?.(item)}
                onKeyDown={(event) => roving.onKeyDown(event, virtual.index)}
              >
                {renderItem(item, { ...row, selected })}
              </Row>
            );
          })}
        </ul>
        {hasPrevious ? <Sentinel which="start" top={0} height={LOAD_PREVIOUS_AT * height} /> : null}
        {hasMore ? (
          <Sentinel which="end" top={LOAD_NEXT_AT * height} height={(1 - LOAD_NEXT_AT) * height} />
        ) : null}
      </div>
      {props.footer}
    </div>
  );
}

/** Entrée de tabulation : la ligne active si elle est rendue, sinon la première ligne rendue. */
function pickTabStop<T>(
  rendered: readonly (T | undefined)[],
  getKey: (item: T) => string,
  active?: string,
) {
  const keys = rendered.flatMap((item) => (item === undefined ? [] : [getKey(item)]));
  return active !== undefined && keys.includes(active) ? active : keys[0];
}

/**
 * Zone de déclenchement : les 20 % de fin (à partir de 80 %) ou de début de la liste chargée, pas une ligne d'un pixel.
 * Un saut de défilement (touche Fin, glissement de la barre, élan tactile) qui franchit 80 % d'un coup rencontre
 * quand même la zone ; une ligne d'un pixel serait enjambée entre deux images.
 */
function Sentinel({ which, top, height }: { which: "start" | "end"; top: number; height: number }) {
  return (
    <div
      aria-hidden="true"
      data-sentinel={which}
      style={{ top, height: Math.max(1, height) }}
      className="pointer-events-none absolute inset-x-0"
    />
  );
}

interface RowProps {
  rowKey: string;
  height: number;
  top: number;
  setSize: number;
  position: number;
  selected: boolean;
  tabStop: boolean;
  children: ReactNode;
  onFocusRow: () => void;
  onActivate: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

function Row({
  rowKey,
  height,
  top,
  setSize,
  position,
  selected,
  tabStop,
  children,
  ...handlers
}: RowProps) {
  return (
    <li
      data-row-key={rowKey}
      aria-setsize={setSize}
      aria-posinset={position}
      aria-current={selected ? "true" : undefined}
      tabIndex={tabStop ? 0 : -1}
      style={{ height, transform: `translateY(${top}px)` }}
      className={cn(
        "absolute inset-x-0 top-0 flex items-center gap-3 border-b border-border px-4 outline-none before:absolute before:inset-y-0 before:left-0 before:w-[3px] hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        selected && "bg-secondary before:bg-primary",
      )}
      onFocus={handlers.onFocusRow}
      onClick={handlers.onActivate}
      onKeyDown={handlers.onKeyDown}
    >
      {children}
    </li>
  );
}
