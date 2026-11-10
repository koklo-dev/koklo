import type { ComponentProps } from "react";
import { cn } from "../lib/cn.ts";
import { Pill } from "./pill.tsx";

/** Phases d'une carte de projet : la Baseline 0 n'est pas une phase de liste (rang 3 sur 4 laissé aux Itérations). */
export type ProjectPhase = "idea" | "framing" | "iterations";

const PHASES: Record<ProjectPhase, { label: string; rank: number }> = {
  idea: { label: "Idée", rank: 0 },
  framing: { label: "Cadrage", rank: 1 },
  iterations: { label: "Itérations", rank: 3 },
};

type BarState = "done" | "current" | "upcoming";

const BAR: Record<BarState, string> = {
  done: "bg-primary",
  current: "bg-primary/45",
  upcoming: "bg-border-strong",
};

const barState = (index: number, rank: number): BarState =>
  index < rank ? "done" : index === rank ? "current" : "upcoming";

export type PhasePillProps = Omit<ComponentProps<typeof Pill>, "children" | "interactive"> & {
  phase: ProjectPhase;
};

/**
 * Pastille de phase d'une carte (DESIGN.md §5.12, maquette 08 l.105-109) : quatre traits de 10 × 4 puis
 * « Cadrage · 2/4 ». Famille de `PhaseRail`, mais à traits de 10 (la planche fait foi).
 */
export function PhasePill({ phase, className, ...props }: PhasePillProps) {
  const { label, rank } = PHASES[phase];
  return (
    <Pill
      data-slot="phase-pill"
      className={cn("gap-1.5 border border-border bg-transparent text-foreground", className)}
      {...(props as ComponentProps<"span">)}
    >
      <span aria-hidden="true" className="inline-flex gap-0.5">
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            data-bar={barState(index, rank)}
            className={cn("h-1 w-2.5 rounded-[2px]", BAR[barState(index, rank)])}
          />
        ))}
      </span>
      <span>
        <span className="sr-only">Phase : </span>
        {label} · {rank + 1}/4
      </span>
    </Pill>
  );
}
