import { type ReactNode, useId } from "react";
import { cn } from "../lib/cn.ts";

export interface Fact {
  label: string;
  value: string;
}

/**
 * Panneau titré de la Sécurité (DESIGN.md §5.28, famille `SpecRowsPanel`, maquette 15 l.181-182, 198-199) : titre
 * 15/600, lignes « intitulé de 120, valeur », contenu libre et note en pied.
 */
export function FactsPanel({
  title,
  facts,
  emptyText,
  note,
  children,
  className,
}: {
  title: string;
  facts?: readonly Fact[];
  /** Texte d'un panneau de faits vide. */
  emptyText?: string;
  note?: string;
  children?: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      data-slot="facts-panel"
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-xl border border-border px-4 py-3.5",
        className,
      )}
    >
      <h2 id={id} className="m-0 text-[15px] font-semibold">
        {title}
      </h2>
      {facts?.length ? (
        <dl className="m-0 flex flex-col gap-2">
          {facts.map((fact) => (
            <div key={fact.label} className="flex flex-wrap gap-x-2 text-meta leading-[1.45]">
              <dt className="basis-[120px] text-muted-foreground">{fact.label}</dt>
              <dd className="m-0 min-w-0 flex-[1_1_180px] break-words">{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {facts && facts.length === 0 && emptyText ? (
        <p className="m-0 text-meta text-muted-foreground">{emptyText}</p>
      ) : null}
      {children}
      {note ? (
        <p className="m-0 text-caption font-normal leading-normal text-muted-foreground">{note}</p>
      ) : null}
    </section>
  );
}

/** Titre 15/600 et aide muette devant un réglage (« Niveau d'exigence », maquette 15 l.189). */
export function SectionLead({ title, help }: { title: string; help: string }) {
  return (
    <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-0.5 max-md:flex-[1_1_220px]">
      <h2 className="m-0 text-[15px] font-semibold">{title}</h2>
      <p className="m-0 text-meta text-muted-foreground">{help}</p>
    </div>
  );
}
