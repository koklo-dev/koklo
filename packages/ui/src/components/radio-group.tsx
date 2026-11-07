"use client";

import { RadioGroup as RadioPrimitive } from "radix-ui";
import { type ComponentProps, type ReactNode, useId } from "react";
import { cn } from "../lib/cn.ts";
import { Pill } from "./pill.tsx";

export function RadioGroup({ className, ...props }: ComponentProps<typeof RadioPrimitive.Root>) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

/** Radio 18 px, bordure 2, point central de 8 px. */
export function RadioGroupItem({
  className,
  ...props
}: ComponentProps<typeof RadioPrimitive.Item>) {
  return (
    <RadioPrimitive.Item
      data-slot="radio-item"
      className={cn(
        "inline-flex size-[18px] shrink-0 items-center justify-center rounded-full border-2 border-border-strong bg-background outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:border-dashed disabled:bg-surface data-[state=checked]:border-primary",
        className,
      )}
      {...props}
    >
      <RadioPrimitive.Indicator className="block size-2 rounded-full bg-primary" />
    </RadioPrimitive.Item>
  );
}

/** Grille de cartes à choix : colonnes `minmax(220px,1fr)`, une colonne à 375 px. */
export function RadioCardGroup({
  className,
  ...props
}: ComponentProps<typeof RadioPrimitive.Root>) {
  return (
    <RadioGroup
      className={cn("grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2", className)}
      {...props}
    />
  );
}

type RadioCardProps = Omit<ComponentProps<typeof RadioPrimitive.Item>, "title"> & {
  title: ReactNode;
  description?: ReactNode;
  /** Pastille facultative à droite du titre. */
  badge?: ReactNode;
};

/** Carte radio (`role="radio"`) : titre 13/600, description 12 muted, choisie = anneau `--primary`. */
export function RadioCard({ title, description, badge, className, ...props }: RadioCardProps) {
  const descId = useId();
  return (
    <RadioPrimitive.Item
      data-slot="radio-card"
      aria-describedby={description ? descId : undefined}
      className={cn(
        "flex min-w-0 flex-col items-start gap-1 rounded-card border bg-background px-3 py-2.5 text-left outline-none motion-safe:transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:border-dashed disabled:border-border-strong disabled:bg-surface disabled:text-muted-foreground data-[state=checked]:border-primary data-[state=checked]:bg-diff-bg data-[state=checked]:ring-1 data-[state=checked]:ring-inset data-[state=checked]:ring-primary",
        className,
      )}
      {...props}
    >
      <span className="flex w-full items-center justify-between gap-2 text-meta font-semibold">
        {title}
        {badge ? (
          <Pill size="sm" tone="soft">
            {badge}
          </Pill>
        ) : null}
      </span>
      {description ? (
        <span id={descId} className="text-caption font-normal text-muted-foreground">
          {description}
        </span>
      ) : null}
    </RadioPrimitive.Item>
  );
}
