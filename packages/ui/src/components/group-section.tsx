"use client";

import { createElement, type HTMLAttributes, type ReactNode, useId, useState } from "react";
import { Icon } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { formatCount } from "../lib/format-count.ts";
import { Button } from "./button.tsx";

export interface GroupSectionProps extends Omit<HTMLAttributes<HTMLElement>, "children" | "title"> {
  label: string;
  /** Compteurs prêts à lire : « 42 · 18 acceptées · 22 à relire ». */
  counts?: string;
  headingLevel?: 2 | 3 | 4;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Action de groupe nommée avec son compte : « Accepter les 22 restantes ». Visible groupe ouvert. */
  action?: { label: string; onClick: () => void };
  /** Éléments encore non affichés dans le groupe. */
  remaining?: number;
  showMoreCount?: number;
  onShowMore?: () => void;
  children: ReactNode;
}

function useOpenState(
  open: boolean | undefined,
  defaultOpen: boolean,
  onOpenChange?: (open: boolean) => void,
) {
  const [inner, setInner] = useState(defaultOpen);
  const value = open ?? inner;
  const set = (next: boolean) => {
    if (open === undefined) setInner(next);
    onOpenChange?.(next);
  };
  return [value, set] as const;
}

function ShowMore({
  remaining,
  showMoreCount,
  onShowMore,
}: Pick<GroupSectionProps, "remaining" | "showMoreCount" | "onShowMore">) {
  const rest = remaining ?? 0;
  if (rest <= 0 || !onShowMore) return null;
  const next = Math.min(showMoreCount ?? 20, rest);
  return (
    <Button variant="ghost" size="sm" className="m-2" onClick={onShowMore}>
      {`Afficher ${formatCount(next)} de plus · ${formatCount(rest)} restante${rest >= 2 ? "s" : ""} dans ce groupe`}
    </Button>
  );
}

/**
 * Groupe repliable (DESIGN.md v2.1 §5.3, schéma 1.4) : en-tête collant sur `--surface`, bouton `aria-expanded`,
 * action de groupe nommée avec son compte, « Afficher N de plus · M restantes dans ce groupe ».
 */
export function GroupSection({
  label,
  counts,
  headingLevel = 3,
  open,
  defaultOpen = false,
  onOpenChange,
  action,
  remaining,
  showMoreCount = 20,
  onShowMore,
  className,
  children,
  ...props
}: GroupSectionProps) {
  const regionId = useId();
  const [isOpen, setOpen] = useOpenState(open, defaultOpen, onOpenChange);
  const toggle = (
    <button
      type="button"
      aria-expanded={isOpen}
      aria-controls={regionId}
      className="flex min-h-9 min-w-0 flex-1 flex-wrap items-center gap-x-2 rounded-md py-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => setOpen(!isOpen)}
    >
      <Icon
        name="keyboard_arrow_down"
        size={20}
        className={cn("shrink-0 motion-safe:transition-transform", !isOpen && "-rotate-90")}
      />
      <span className="min-w-0 break-words text-subsection-title text-foreground">{label}</span>
      {counts ? <span className="min-w-0 text-meta text-muted-foreground">{counts}</span> : null}
    </button>
  );
  return (
    <section
      data-slot="group-section"
      className={cn("rounded-xl border bg-background", className)}
      {...props}
    >
      <div
        data-slot="group-section-header"
        className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-t-xl border-b bg-surface px-3 py-1.5"
      >
        {createElement(`h${headingLevel}`, { className: "min-w-0 grow basis-56" }, toggle)}
        {isOpen && action ? (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 max-sm:w-full"
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        ) : null}
      </div>
      <div id={regionId} hidden={!isOpen}>
        {isOpen ? (
          <>
            {children}
            <ShowMore remaining={remaining} showMoreCount={showMoreCount} onShowMore={onShowMore} />
          </>
        ) : null}
      </div>
    </section>
  );
}
