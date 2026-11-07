import type { ComponentProps } from "react";
import { cn } from "../lib/cn.ts";
import { Pill, type PillTone } from "./pill.tsx";

export type CountBadgeTone = Extract<
  PillTone,
  "soft" | "primary" | "success" | "warning" | "outline"
>;

export type CountBadgeProps = Omit<ComponentProps<"span">, "children"> & {
  tone?: CountBadgeTone;
  children: string | number;
};

/** Compteur (DESIGN.md §5.5) : `Pill` xs, marges 7, 11/600. Le nombre est le nom accessible. */
export function CountBadge({ tone = "soft", className, ...props }: CountBadgeProps) {
  return (
    <Pill
      size="xs"
      tone={tone}
      data-slot="count-badge"
      className={cn("px-[7px]", className)}
      {...props}
    />
  );
}

export type DotProps = Omit<ComponentProps<"span">, "aria-label" | "children" | "role"> & {
  /** Nom accessible obligatoire : le repère n'a pas de texte. */
  "aria-label": string;
};

/** Repère de nouveauté (DESIGN.md §5.5) : 7 × 7 rond `--primary`. */
export function Dot({ className, ...props }: DotProps) {
  return (
    <span
      data-slot="dot"
      role="img"
      className={cn("inline-block size-[7px] shrink-0 rounded-full bg-primary", className)}
      {...props}
    />
  );
}
