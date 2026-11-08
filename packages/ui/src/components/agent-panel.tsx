"use client";

import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { IconTile } from "./icon-tile.tsx";
import { SegmentedControl } from "./segmented-control.tsx";

export type AgentMode = "interview" | "free";

const MODES = [
  { value: "interview", label: "Entretien" },
  { value: "free", label: "Libre" },
] as const;

export type AgentPanelProps = Omit<ComponentProps<"aside">, "title" | "children"> & {
  /** Sans `mode`, le sélecteur Entretien / Libre est absent (agent non configuré). */
  mode?: AgentMode;
  onModeChange?: (mode: AgentMode) => void;
  title?: string;
  /** Fil de messages, cartes : zone défilante. */
  children: ReactNode;
  /** Saisie et mention de confidentialité, sous le fil. */
  footer?: ReactNode;
};

/** Panneau de l'agent (maquette 06, DESIGN.md §5.9) : colonne 360 à 380 px, `--surface`, bordure à gauche. */
export function AgentPanel({
  mode,
  onModeChange,
  title = "Agent",
  children,
  footer,
  className,
  ...props
}: AgentPanelProps) {
  return (
    <aside
      aria-label={title}
      data-slot="agent-panel"
      className={cn("flex min-w-0 flex-col border-border border-l bg-surface", className)}
      {...props}
    >
      <div className="flex items-center gap-2.5 border-b px-4 py-3.5">
        <IconTile icon="wand_stars" size={28} tone="soft" />
        <span className="flex-1 font-semibold">{title}</span>
        {mode ? (
          <SegmentedControl
            aria-label="Mode de l'agent"
            options={MODES}
            value={mode}
            onValueChange={(next) => onModeChange?.(next)}
          />
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto p-4">{children}</div>
      {footer ? <div className="flex flex-col gap-2 border-t px-4 pt-3 pb-4">{footer}</div> : null}
    </aside>
  );
}
