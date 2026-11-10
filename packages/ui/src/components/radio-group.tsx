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

/** Carte radio (`role="radio"`) : bouton radio 18 visible, titre 14/600, description 12 muted, choisie = anneau `--primary`. */
export function RadioCard({ title, description, badge, className, ...props }: RadioCardProps) {
  const descId = useId();
  return (
    <RadioPrimitive.Item
      data-slot="radio-card"
      aria-describedby={description ? descId : undefined}
      className={cn(
        "group/radio flex min-w-0 items-start gap-2.5 rounded-card border bg-background p-3 text-left outline-none motion-safe:transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:border-dashed disabled:border-border-strong disabled:bg-surface disabled:text-muted-foreground data-[state=checked]:border-primary data-[state=checked]:bg-diff-bg data-[state=checked]:ring-1 data-[state=checked]:ring-inset data-[state=checked]:ring-primary",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        data-slot="radio-card-mark"
        className="mt-[3px] inline-flex size-[18px] shrink-0 items-center justify-center rounded-full border-2 border-border-strong bg-background group-data-[state=checked]/radio:border-primary"
      >
        <RadioPrimitive.Indicator className="block size-2 rounded-full bg-primary" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <span className="flex w-full items-center justify-between gap-2 text-body font-semibold">
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
      </span>
    </RadioPrimitive.Item>
  );
}
