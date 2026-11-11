"use client";

import { type ComponentProps, useId } from "react";
import { Icon, type IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { Popover, PopoverContent, PopoverTrigger } from "./popover.tsx";

export type AgentProposeState = "idle" | "open" | "running" | "ready" | "unavailable";

export type AgentProposeButtonProps = Omit<
  ComponentProps<"button">,
  "children" | "type" | "aria-disabled" | "aria-busy"
> & {
  state: AgentProposeState;
  /** Nombre de propositions à relire (état `ready`). */
  readyCount?: number;
  /** Raison de l'indisponibilité (état `unavailable`) : ouverte au clic, reliée au bouton. */
  reason?: string;
  /** Lien « Ouvrir les réglages » de la raison. */
  settingsHref?: string;
  /** Libellé au repos propre à un emplacement (ex. carte d'état vide « Proposer le fonctionnel », maquette 10 l.99). */
  idleLabel?: string;
};

const HALO = "shadow-[0_0_0_3px_var(--secondary)]";

/** Gabarit commun (maquette 21 l.110) : 36 de haut (44 sous 768), marges 0 14 0 12, rayon 6, 14/500. */
const BASE =
  "inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md pl-3 pr-3.5 text-sm font-medium outline-none motion-safe:transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:h-9";
const PRIMARY = "bg-primary text-primary-foreground hover:bg-primary/90";

const LOOK: Record<AgentProposeState, string> = {
  idle: PRIMARY,
  open: cn(PRIMARY, HALO),
  running: cn(PRIMARY, "cursor-progress opacity-[.82]"),
  ready: cn(PRIMARY, HALO),
  unavailable: "border border-dashed border-border-strong bg-surface text-muted-foreground",
};

const ICON: Record<AgentProposeState, IconName> = {
  idle: "wand_stars",
  open: "wand_stars",
  running: "progress_activity",
  ready: "rate_review",
  unavailable: "wand_stars",
};

const IDLE_LABEL = "Proposer avec l'agent";

function label(state: AgentProposeState, readyCount: number, idleLabel: string): string {
  if (state === "running") return "L'agent propose…";
  if (state === "ready") return `Relire ${readyCount} proposition${readyCount > 1 ? "s" : ""}`;
  return idleLabel;
}

/**
 * Bouton unique « Proposer avec l'agent » (DESIGN.md §5.13, maquette 21) : primaire, même libellé et même icône sur
 * chaque livrable. Il ne lance jamais rien seul : `idle` ouvre la modale, `ready` ouvre la relecture, `running` et
 * `unavailable` ne déclenchent rien (`aria-disabled`, le bouton reste focalisable).
 */
export function AgentProposeButton({
  state,
  readyCount = 0,
  reason,
  settingsHref,
  idleLabel = IDLE_LABEL,
  className,
  onClick,
  ...props
}: AgentProposeButtonProps) {
  const reasonId = useId();
  const inert = state === "running" || state === "unavailable";
  const button = (
    <button
      type="button"
      data-slot="agent-propose-button"
      data-state={state}
      aria-disabled={inert || undefined}
      aria-busy={state === "running" || undefined}
      aria-expanded={state === "open" ? true : undefined}
      aria-haspopup={state === "open" || state === "idle" ? "dialog" : undefined}
      aria-describedby={state === "unavailable" && reason ? reasonId : undefined}
      className={cn(BASE, LOOK[state], className)}
      onClick={inert ? undefined : onClick}
      {...props}
    >
      <Icon
        name={ICON[state]}
        size={20}
        className={state === "running" ? "motion-safe:animate-spin" : undefined}
      />
      {label(state, readyCount, idleLabel)}
    </button>
  );
  if (state !== "unavailable" || !reason) return button;
  return (
    <Popover>
      <span id={reasonId} className="sr-only">
        {reason}
      </span>
      <PopoverTrigger asChild>{button}</PopoverTrigger>
      <PopoverContent align="start" className="flex w-72 flex-col gap-2 text-meta">
        <p>{reason}</p>
        {settingsHref ? (
          <a href={settingsHref} className="w-fit font-semibold underline underline-offset-4">
            Ouvrir les réglages
          </a>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
