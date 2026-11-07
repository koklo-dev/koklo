"use client";

import type { HTMLAttributes } from "react";
import { Icon } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { formatCount } from "../lib/format-count.ts";
import { Button } from "./button.tsx";
import { SegmentedControl } from "./segmented-control.tsx";

export const PAGE_SIZES = [25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export type PageItem = number | "gap";

/** Numéros affichés : première, dernière, courante et ses voisines ; une page isolée remplace l'ellipse. */
export function pageItems(page: number, pageCount: number): PageItem[] {
  const wanted = new Set([1, pageCount, page - 1, page, page + 1]);
  const pages = [...wanted].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  const items: PageItem[] = [];
  let previous = 0;
  for (const current of pages) {
    if (current - previous === 2) items.push(previous + 1);
    else if (current - previous > 2) items.push("gap");
    items.push(current);
    previous = current;
  }
  return items;
}

export interface PaginationProps
  extends Omit<HTMLAttributes<HTMLElement>, "children" | "onChange"> {
  page: number;
  size: PageSize;
  total: number;
  /** Au-delà de 10 000 lignes : total estimé, précédent / suivant seulement. */
  totalIsEstimate?: boolean;
  /** Estimation : faux quand le serveur sait qu'il n'y a plus de suite. */
  hasNext?: boolean;
  onPageChange: (page: number) => void;
  onSizeChange: (size: PageSize) => void;
}

const SIZE_OPTIONS = PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }));
const CELL =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 font-mono text-meta";
const PAGE_BUTTON = cn(
  CELL,
  "border border-border bg-background text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors",
);
const CURRENT = "border-0 bg-primary text-primary-foreground hover:bg-primary/90";

function rangeText(page: number, size: number, total: number, estimate: boolean): string {
  if (total === 0) return "0 sur 0";
  const from = (page - 1) * size + 1;
  const to = Math.min(page * size, total);
  const of = `${estimate ? "environ " : ""}${formatCount(total)}`;
  return `${formatCount(from)}–${formatCount(to)} sur ${of}`;
}

function Numbers({
  page,
  pageCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  onPageChange: (p: number) => void;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-3">
      {pageItems(page, pageCount).map((item, index) =>
        item === "gap" ? (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: les ellipses n'ont pas d'identité ; leur rang suffit
            key={`gap-${index}`}
            data-slot="pagination-gap"
            aria-hidden="true"
            className={cn(CELL, "text-muted-foreground")}
          >
            …
          </li>
        ) : (
          <li key={item}>
            <button
              type="button"
              aria-label={`Page ${item}`}
              aria-current={item === page ? "page" : undefined}
              className={cn(PAGE_BUTTON, item === page && CURRENT)}
              onClick={() => onPageChange(item)}
            >
              {item}
            </button>
          </li>
        ),
      )}
    </ol>
  );
}

function StepButton({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: "chevron_left" | "chevron_right";
  disabled: boolean;
  onClick: () => void;
}) {
  // Une position n'est pas un prérequis manquant : désactivé sans raison visible (B26).
  return (
    <Button
      variant="outline"
      size="sm"
      className="w-8 px-0"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} size={18} />
    </Button>
  );
}

/** Pagination par décalage (DESIGN.md v2.1 §5.3, schéma 1.2) : « 1–25 sur 1 240 », numéros, taille 25 / 50 / 100. */
export function Pagination({
  page,
  size,
  total,
  totalIsEstimate = false,
  hasNext,
  onPageChange,
  onSizeChange,
  className,
  ...props
}: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / size));
  const first = page <= 1;
  const last = totalIsEstimate ? hasNext === false : page >= pageCount;
  return (
    <nav
      aria-label="Pagination"
      data-slot="pagination"
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t bg-surface px-3.5 py-2.5 text-meta",
        className,
      )}
      {...props}
    >
      <p className="text-muted-foreground">{rangeText(page, size, total, totalIsEstimate)}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span aria-hidden="true">Lignes par page</span>
          <SegmentedControl
            size="xs"
            aria-label="Lignes par page"
            options={SIZE_OPTIONS}
            value={String(size)}
            onValueChange={(value) => onSizeChange(Number(value) as PageSize)}
          />
        </span>
        <StepButton
          label="Page précédente"
          icon="chevron_left"
          disabled={first}
          onClick={() => onPageChange(page - 1)}
        />
        {totalIsEstimate ? null : (
          <Numbers page={page} pageCount={pageCount} onPageChange={onPageChange} />
        )}
        <StepButton
          label="Page suivante"
          icon="chevron_right"
          disabled={last}
          onClick={() => onPageChange(page + 1)}
        />
      </div>
    </nav>
  );
}
