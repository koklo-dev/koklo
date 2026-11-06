"use client";

import type { HTMLAttributes } from "react";
import { Icon, type IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { type CountNoun, formatCount, nounFor } from "../lib/format-count.ts";
import { Button } from "./button.tsx";
import { Skeleton } from "./skeleton.tsx";

export type ListFooterState = "more" | "loading" | "error" | "end";

interface FooterOptions {
  state: ListFooterState;
  /** Taille de la page suivante : 50 (liste), 30 (colonne), 24 (grille). */
  pageSize?: number;
  /** Éléments déjà affichés, pour le texte d'erreur. */
  loadedCount?: number;
  total?: number;
  noun?: CountNoun;
  /** Éléments restant à charger (version compacte). */
  remaining?: number;
  endLabel?: string;
  /** Vrai quand la liste dépasse deux écrans : « Revenir en haut » apparaît à la fin. */
  longList?: boolean;
  onLoadMore?: () => void;
  onRetry?: () => void;
  onBackToTop?: () => void;
}

export interface ListFooterProps
  extends FooterOptions,
    Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** `compact` : pied de colonne du kanban, une ligne par état. */
  variant?: "full" | "compact";
}

const FRAME = "border-border bg-surface text-meta text-muted-foreground";
const COMPACT_FRAME = "rounded-xl border border-dashed border-border-strong text-center";
const ERROR_FRAME = "border-alert-error-border bg-alert-error text-alert-error-foreground";

function Message({ icon, children }: { icon?: IconName; children: string }) {
  return (
    <p className="flex min-w-0 flex-1 items-center gap-2">
      {icon ? <Icon name={icon} size={20} /> : null}
      <span>{children}</span>
    </p>
  );
}

function shownText(count: number | undefined): string {
  return count === 1
    ? "La première reste affichée."
    : `Les ${formatCount(count ?? 0)} premières restent affichées.`;
}

function FullBody({
  state,
  pageSize = 50,
  loadedCount,
  total = 0,
  noun,
  longList,
  onLoadMore,
  onRetry,
  onBackToTop,
}: FooterOptions) {
  if (state === "more") {
    return (
      <>
        <Message icon="expand_circle_down">{`Les ${formatCount(pageSize)} suivantes se chargent automatiquement en approchant du bas.`}</Message>
        <Button variant="outline" size="sm" onClick={onLoadMore}>
          Charger la suite
        </Button>
      </>
    );
  }
  if (state === "loading") {
    return (
      <>
        <div className="flex basis-full flex-col gap-2">
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-10 w-full" />
          ))}
        </div>
        <Message>{`Chargement des ${formatCount(pageSize)} suivantes…`}</Message>
      </>
    );
  }
  if (state === "error") {
    return (
      <>
        <Message icon="error">{`Impossible de charger la suite. ${shownText(loadedCount)}`}</Message>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Réessayer
        </Button>
      </>
    );
  }
  const name = noun ? ` ${nounFor(total, noun)}` : "";
  return (
    <>
      <Message icon="check">{`Fin de la liste · ${formatCount(total)}${name}`}</Message>
      {longList ? (
        <Button variant="ghost" size="sm" onClick={onBackToTop}>
          <Icon name="arrow_upward" size={20} />
          Revenir en haut
        </Button>
      ) : null}
    </>
  );
}

function CompactBody({
  state,
  remaining,
  endLabel = "Fin de la liste",
  onLoadMore,
  onRetry,
}: FooterOptions) {
  if (state === "more") {
    const rest = remaining ?? 0;
    return (
      <Button variant="ghost" size="sm" onClick={onLoadMore}>
        {`Charger la suite · ${formatCount(rest)} restante${rest >= 2 ? "s" : ""}`}
      </Button>
    );
  }
  if (state === "loading") return <span>Chargement…</span>;
  if (state === "error") {
    return (
      <>
        <span>Impossible de charger la suite.</span>
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Réessayer
        </Button>
      </>
    );
  }
  return <span>{endLabel}</span>;
}

/**
 * Pied de liste à quatre états (DESIGN.md v2.1 §5.3) : suite à charger, chargement, erreur, fin.
 * Seul l'état d'erreur parle (`role="alert"`) ; la région d'état de la `CountBar` annonce le reste.
 */
export function ListFooter({ variant = "full", className, ...props }: ListFooterProps) {
  const {
    state,
    pageSize,
    loadedCount,
    total,
    noun,
    remaining,
    endLabel,
    longList,
    onLoadMore,
    onRetry,
    onBackToTop,
    ...attrs
  } = props;
  const options = {
    state,
    pageSize,
    loadedCount,
    total,
    noun,
    remaining,
    endLabel,
    longList,
    onLoadMore,
    onRetry,
    onBackToTop,
  };
  const compact = variant === "compact";
  return (
    <div
      data-slot="list-footer"
      data-state={state}
      data-variant={variant}
      role={state === "error" ? "alert" : undefined}
      aria-busy={state === "loading" || undefined}
      className={cn(
        FRAME,
        state === "error" && ERROR_FRAME,
        compact
          ? cn(COMPACT_FRAME, "flex flex-wrap items-center justify-center gap-2 px-3 py-2")
          : "flex flex-wrap items-center gap-2.5 border-t px-4 py-3",
        className,
      )}
      {...attrs}
    >
      {compact ? <CompactBody {...options} /> : <FullBody {...options} />}
    </div>
  );
}
