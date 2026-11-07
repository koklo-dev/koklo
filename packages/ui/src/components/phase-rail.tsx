"use client";

import type { HTMLAttributes } from "react";
import { primeIcon } from "../icons/cache.ts";
import * as check from "../icons/generated/check.ts";
import * as editNote from "../icons/generated/edit_note.ts";
import * as flag from "../icons/generated/flag.ts";
import * as lightbulb from "../icons/generated/lightbulb.ts";
import * as sync from "../icons/generated/sync.ts";
import { Icon, type IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";

// Le fil de phase est toujours visible : ses icônes sont rendues sans attente.
primeIcon("check", check);
primeIcon("lightbulb", lightbulb);
primeIcon("edit_note", editNote);
primeIcon("flag", flag);
primeIcon("sync", sync);

export type Phase = "idea" | "framing" | "baseline" | "iterations";

const STEPS: ReadonlyArray<{ phase: Phase; label: string; icon: IconName }> = [
  { phase: "idea", label: "Idée", icon: "lightbulb" },
  { phase: "framing", label: "Cadrage", icon: "edit_note" },
  { phase: "baseline", label: "Baseline 0", icon: "flag" },
  { phase: "iterations", label: "Itérations", icon: "sync" },
];

type StepState = "done" | "current" | "upcoming";

const STATE_TEXT: Record<StepState, string> = {
  done: "terminée",
  current: "en cours",
  upcoming: "à venir",
};

const DOT: Record<StepState, string> = {
  done: "bg-primary text-primary-foreground",
  current: "bg-secondary text-secondary-foreground ring-2 ring-primary",
  upcoming: "border bg-surface text-muted-foreground",
};

const TRACK: Record<StepState, string> = {
  done: "bg-primary",
  current: "bg-primary/45",
  upcoming: "bg-border-strong",
};

const stateOf = (index: number, current: number): StepState =>
  index < current ? "done" : index === current ? "current" : "upcoming";

type SpanProps = Omit<HTMLAttributes<HTMLElement>, "children">;

export interface PhaseRailProps extends SpanProps {
  phase: Phase;
  size?: "default" | "sm" | "inline";
  subtitles?: Partial<Record<Phase, string>>;
}

const MINI = {
  sm: { frame: "h-7 gap-2 rounded-full border px-2.5 text-foreground", bar: "w-3.5" },
  inline: { frame: "gap-2 text-muted-foreground", bar: "w-3" },
} as const;

function PhaseRailMini({
  current,
  size,
  className,
  ...props
}: { current: number; size: keyof typeof MINI } & SpanProps) {
  return (
    <span
      data-slot="phase-rail"
      data-size={size}
      className={cn(
        "inline-flex items-center whitespace-nowrap text-caption font-normal",
        MINI[size].frame,
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className="inline-flex gap-[3px]">
        {STEPS.map((step, i) => (
          <span
            key={step.phase}
            className={cn("h-1 rounded-[2px]", MINI[size].bar, TRACK[stateOf(i, current)])}
          />
        ))}
      </span>
      <span>
        <span className="sr-only">Phase : </span>
        {STEPS[current]?.label} · {current + 1} sur 4
      </span>
    </span>
  );
}

function PhaseStep({
  index,
  current,
  subtitle,
}: {
  index: number;
  current: number;
  subtitle?: string;
}) {
  const step = STEPS[index] as (typeof STEPS)[number];
  const state = stateOf(index, current);
  return (
    <li
      aria-current={state === "current" ? "step" : undefined}
      className="flex min-w-0 flex-[1_1_200px] flex-col gap-2.5"
    >
      {/* Maquette 04 : pastille puis trait sur une ligne continue, libellé et légende dessous. */}
      <span className="flex items-center">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full",
            DOT[state],
          )}
        >
          <Icon
            name={state === "done" ? "check" : step.icon}
            size={18}
            fill={state !== "upcoming"}
          />
        </span>
        {index < STEPS.length - 1 ? (
          <span
            aria-hidden="true"
            className={cn(
              "mx-3 h-0.5 flex-1 rounded-full",
              state === "done" ? "bg-primary" : "bg-border",
            )}
          />
        ) : null}
      </span>
      <span className="text-subsection-title text-foreground">
        {step.label} <span className="font-normal text-muted-foreground">{STATE_TEXT[state]}</span>
      </span>
      {subtitle ? <span className="text-meta text-muted-foreground">{subtitle}</span> : null}
    </li>
  );
}

/** Fil de phase Idée → Cadrage → Baseline 0 → Itérations, la signature de Koklo (DESIGN.md v2 §5.1). */
export function PhaseRail({
  phase,
  size = "default",
  subtitles,
  className,
  ...props
}: PhaseRailProps) {
  const current = STEPS.findIndex((step) => step.phase === phase);
  if (size !== "default") {
    return <PhaseRailMini current={current} size={size} className={className} {...props} />;
  }
  return (
    <ol
      data-slot="phase-rail"
      aria-label="Phase du projet"
      className={cn("flex flex-wrap gap-y-4", className)}
      {...props}
    >
      {STEPS.map((step, i) => (
        <PhaseStep
          key={step.phase}
          index={i}
          current={current}
          subtitle={subtitles?.[step.phase]}
        />
      ))}
    </ol>
  );
}
