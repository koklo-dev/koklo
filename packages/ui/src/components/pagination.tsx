"use client";

import type { HTMLAttributes } from "react";
import { Icon } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { formatCount } from "../lib/format-count.ts";
import { Button } from "./button.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select.tsx";

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

const PAGE_BUTTON =
  "inline-flex h-9 min-w-9 items-center justify-center rounded-md px-2 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors";
const CURRENT = "bg-primary text-primary-foreground hover:bg-primary/90";

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
    <ol className="flex flex-wrap items-center gap-1">
      {pageItems(page, pageCount).map((item, index) =>
        item === "gap" ? (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: les ellipses n'ont pas d'identité ; leur rang suffit
            key={`gap-${index}`}
            data-slot="pagination-gap"
            aria-hidden="true"
            className="px-1 text-muted-foreground"
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
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-meta",
        className,
      )}
      {...props}
    >
      <p className="text-muted-foreground">{rangeText(page, size, total, totalIsEstimate)}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Page précédente"
          disabled={first}
          disabledReason="Première page"
          onClick={() => onPageChange(page - 1)}
        >
          <Icon name="chevron_left" size={20} />
        </Button>
        {totalIsEstimate ? null : (
          <Numbers page={page} pageCount={pageCount} onPageChange={onPageChange} />
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Page suivante"
          disabled={last}
          disabledReason="Dernière page"
          onClick={() => onPageChange(page + 1)}
        >
          <Icon name="chevron_right" size={20} />
        </Button>
        <Select
          value={String(size)}
          onValueChange={(value) => onSizeChange(Number(value) as PageSize)}
        >
          <SelectTrigger aria-label="Lignes par page" className="w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </nav>
  );
}
