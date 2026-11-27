"use client";

import { createElement, type HTMLAttributes, type ReactNode, useId, useState } from "react";
import { Icon, type IconName } from "../icons/icon.tsx";
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
  /** Identifiant mono devant le libellé (surface d'une menace, « F-004 »). */
  tag?: string;
  /** Compteurs en fin d'en-tête plutôt qu'à la suite du libellé (maquette 15 l.130). */
  countsAtEnd?: boolean;
  /** Action de groupe nommée avec son compte : « Accepter les 22 restantes ». Visible replié comme ouvert. */
  action?: { label: string; onClick: () => void };
  /** `card` (défaut) : cadre arrondi ; `stacked` : sans cadre, bordure basse, pour empiler dans un `ListPanel`. */
  variant?: "card" | "stacked";
  /** Icône de l'action de groupe (`done_all`). */
  actionIcon?: IconName;
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
    <Button
      variant="ghost"
      size="sm"
      className="h-9 w-full justify-start rounded-none border-t px-10 text-primary hover:text-primary"
      onClick={onShowMore}
    >
      {`Afficher ${formatCount(next)} de plus · ${formatCount(rest)} restante${rest >= 2 ? "s" : ""} dans ce groupe`}
    </Button>
  );
}

/** Bascule de l'en-tête : chevron, identifiant mono jamais coupé (écart 12, maquette 15 l.130), libellé. */
function GroupToggle({
  label,
  tag,
  open,
  regionId,
  onToggle,
}: Pick<GroupSectionProps, "label" | "tag"> & {
  open: boolean;
  regionId: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={regionId}
      className={cn(
        "flex min-h-7 min-w-0 flex-1 items-center rounded-md px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        tag ? "gap-x-3" : "gap-x-1.5",
      )}
      onClick={onToggle}
    >
      <Icon
        name="keyboard_arrow_down"
        size={18}
        className={cn(
          "shrink-0 text-muted-foreground motion-safe:transition-transform",
          !open && "-rotate-90",
        )}
      />
      {tag ? (
        <>
          <span className="shrink-0 whitespace-nowrap font-mono text-code font-normal text-muted-foreground">
            {tag}
          </span>{" "}
        </>
      ) : null}
      <span className="min-w-0 break-words text-subsection-title text-foreground">{label}</span>
    </button>
  );
}

/**
 * Groupe repliable (DESIGN.md v2.1 §5.3, schéma 1.4) : en-tête collant sur `--surface`, bouton `aria-expanded`,
 * action de groupe nommée avec son compte, « Afficher N de plus · M restantes dans ce groupe ».
 */
export function GroupSection({
  label,
  counts,
  tag,
  countsAtEnd = false,
  headingLevel = 3,
  variant = "card",
  actionIcon,
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
    <GroupToggle
      label={label}
      tag={tag}
      open={isOpen}
      regionId={regionId}
      onToggle={() => setOpen(!isOpen)}
    />
  );
  return (
    <section
      data-slot="group-section"
      className={cn(
        variant === "stacked" ? "border-b" : "rounded-xl border bg-background",
        className,
      )}
      {...props}
    >
      <div
        data-slot="group-section-header"
        className={cn(
          "sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-surface px-3.5 py-2.5",
          variant === "card" && "rounded-t-xl border-b",
        )}
      >
        <div className="flex min-w-0 grow basis-56 flex-wrap items-center gap-x-2">
          {createElement(
            `h${headingLevel}`,
            { className: cn("flex min-w-0 shrink", countsAtEnd && "grow") },
            toggle,
          )}
          {counts ? (
            <span className="min-w-0 text-caption font-normal text-muted-foreground">{counts}</span>
          ) : null}
        </div>
        {action ? (
          <Button
            variant="outline"
            size="xs"
            icon={actionIcon}
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
