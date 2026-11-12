"use client";

import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "../lib/cn.ts";
import { ProposalReviewBanner } from "./proposal-review-banner.tsx";
import { ProposalReviewList } from "./proposal-review-list.tsx";
import {
  PROPOSAL_GROUP_THRESHOLD,
  type ProposalDecision,
  type ProposalFilter,
  type ProposalReviewCounts,
  type ProposalReviewGroup,
  type ProposalReviewItem,
  type ProposalSaveProgress,
} from "./proposal-review-types.ts";

export interface ProposalReviewProps {
  counts: ProposalReviewCounts;
  groups: readonly ProposalReviewGroup[];
  /** Filtre courant de la relecture en volume (« À relire » par défaut). */
  filter?: ProposalFilter;
  onFilterChange?: (filter: ProposalFilter) => void;
  selectedId?: string | undefined;
  onSelect: (id: string) => void;
  onDecide: (id: string, decision: ProposalDecision) => void;
  /** « Accepter les N restantes » d'un groupe ; jamais de toute la relecture. */
  onAcceptGroup?: (groupKey: string) => void;
  /** « Afficher 20 de plus » d'un groupe. */
  onLoadMore?: (groupKey: string) => void;
  onSave?: () => void;
  saving?: boolean;
  /** Avancement pendant l'enregistrement : la barre du bandeau se remplit en vert, lot après lot. */
  saveProgress?: ProposalSaveProgress | undefined;
  onLeave: () => void;
  /** Annonce polie (« F-012 acceptée ») : la seule région d'état de la vue. */
  announcement?: string;
  /** Le détail : un `ProposalDetail` pour la proposition choisie. */
  children?: ReactNode;
  className?: string;
}

const TYPING = "input, textarea, select, [contenteditable='']";

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof Element && target.closest(`${TYPING}, [contenteditable='true']`) !== null
  );
}

/** Éléments atteignables par J et K : ceux des groupes dépliés, dans l'ordre d'affichage. */
function reachable(
  groups: readonly ProposalReviewGroup[],
  collapsed: ReadonlySet<string>,
  grouped: boolean,
) {
  return groups.filter((g) => !grouped || !collapsed.has(g.key)).flatMap((g) => g.items);
}

function nextPending(
  all: readonly ProposalReviewItem[],
  id: string,
): ProposalReviewItem | undefined {
  const from = all.findIndex((item) => item.id === id);
  return all.slice(from + 1).find((item) => item.status === "pending");
}

function useToggleSet() {
  const [set, setSet] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string) =>
    setSet((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  return [set, toggle] as const;
}

/** Le focus suit la sélection au clavier ; il n'est repris que s'il est tombé sur <body> (bouton disparu). */
function useFocusFollowsSelection(
  root: RefObject<HTMLElement | null>,
  selectedId?: string,
  status?: string,
) {
  const requested = useRef(false);
  const mounted = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: déclenché par la sélection ou son état
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const target = root.current?.querySelector<HTMLElement>(
      "[data-slot=proposal-review-list] [aria-current='true']",
    );
    if (target && (requested.current || document.activeElement === document.body)) target.focus();
    requested.current = false;
  }, [selectedId, status]);
  return () => {
    requested.current = true;
  };
}

/** J, K, A, R : actifs dans la relecture seulement, jamais dans un champ de saisie ni avec une touche de modification. */
function useShortcuts(
  props: ProposalReviewProps,
  grouped: boolean,
  collapsed: ReadonlySet<string>,
  wantFocus: () => void,
) {
  const { groups, selectedId, onSelect, onDecide } = props;
  const all = groups.flatMap((g) => g.items);
  const current = all.find((item) => item.id === selectedId);
  const move = (delta: 1 | -1) => {
    const list = reachable(groups, collapsed, grouped);
    const index = list.findIndex((item) => item.id === selectedId);
    const next = list[index === -1 ? (delta === 1 ? 0 : list.length - 1) : index + delta];
    if (!next) return;
    wantFocus();
    onSelect(next.id);
  };
  const decide = (decision: "accepted" | "rejected") => {
    if (current?.status !== "pending") return;
    onDecide(current.id, decision);
    const next = nextPending(all, current.id);
    if (next) onSelect(next.id);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (
      event.defaultPrevented ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      isTyping(event.target)
    )
      return;
    const key = event.key.toLowerCase();
    if (key === "j") move(1);
    else if (key === "k") move(-1);
    else if (key === "a") decide("accepted");
    else if (key === "r") decide("rejected");
  };
  return { onKeyDown, status: current?.status };
}

/**
 * Relecture des propositions de l'agent (DESIGN.md §5.13, maquettes 10 et 12) : bandeau, liste de 330 px à plat
 * ou en groupes au-delà de 30, détail en enfant. Raccourcis J, K, A, R actifs seulement quand le focus est dans la
 * relecture et hors champ de saisie (WCAG 2.1.4). Les données et les décisions restent au parent.
 */
export function ProposalReview(props: ProposalReviewProps) {
  const { counts, groups, selectedId, onSelect, announcement = "", className } = props;
  const grouped = counts.total > PROPOSAL_GROUP_THRESHOLD;
  const [collapsed, toggle] = useToggleSet();
  const root = useRef<HTMLElement>(null);
  const keys = useShortcuts(props, grouped, collapsed, () => wantFocus());
  const wantFocus = useFocusFollowsSelection(root, selectedId, keys.status);
  return (
    <section
      ref={root}
      aria-label="Relecture des propositions"
      data-slot="proposal-review"
      className={cn("flex min-w-0 flex-col", className)}
      onKeyDown={keys.onKeyDown}
    >
      <ProposalReviewBanner
        counts={counts}
        onSave={props.onSave}
        saving={props.saving}
        saveProgress={props.saveProgress}
        onLeave={props.onLeave}
      />
      <div className="flex min-h-0 flex-wrap">
        <ProposalReviewList
          counts={counts}
          groups={groups}
          grouped={grouped}
          filter={props.filter ?? "pending"}
          onFilterChange={props.onFilterChange}
          selectedId={selectedId}
          collapsed={collapsed}
          onToggleGroup={toggle}
          onSelect={onSelect}
          onAcceptGroup={props.onAcceptGroup}
          onLoadMore={props.onLoadMore}
        />
        {props.children}
      </div>
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </section>
  );
}
