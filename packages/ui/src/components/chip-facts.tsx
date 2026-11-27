import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";

export interface ChipFact {
  label: string;
  /** Puces (`EntityChip`). */
  children: ReactNode;
}

/** Faits à puces d'une fiche (DESIGN.md §5.28, maquette 15 l.145-147) : intitulé de 120, puces à la suite. */
export function ChipFacts({
  facts,
  className,
}: {
  facts: readonly ChipFact[];
  className?: string;
}) {
  return (
    <dl data-slot="chip-facts" className={cn("m-0 flex flex-col gap-2", className)}>
      {facts.map((fact) => (
        <div key={fact.label} className="flex flex-wrap items-start gap-x-2.5 gap-y-1">
          <dt className="basis-[120px] pt-[3px] text-caption font-normal text-muted-foreground">
            {fact.label}
          </dt>
          <dd className="m-0 flex min-w-0 flex-[1_1_160px] flex-wrap gap-1.5">{fact.children}</dd>
        </div>
      ))}
    </dl>
  );
}
