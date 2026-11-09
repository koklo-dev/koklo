import { cn } from "../lib/cn.ts";

/** « 3 pages stables sur 10 » ; « 1 page stable » au singulier (0 aussi, en français). */
export function maturityText(stable: number, total: number): string {
  return `${stable} ${stable > 1 ? "pages stables" : "page stable"} sur ${total}`;
}

/**
 * Jauge de maturité du dossier (DESIGN.md §5.10, maquette 06 l.52-53) : un cran de 10 × 6 par page hors corbeille,
 * `--primary` pour une page stable, `--border-strong` sinon ; le texte l'accompagne, la couleur n'est jamais seule.
 * Les crans passent à la ligne quand la largeur manque.
 */
export function MaturityMeter({
  stable,
  total,
  label = "Maturité du dossier",
  className,
}: {
  stable: number;
  total: number;
  label?: string;
  className?: string;
}) {
  const reached = Math.min(Math.max(stable, 0), total);
  return (
    <span
      data-slot="maturity-meter"
      className={cn("inline-flex items-center gap-2.5 text-meta text-muted-foreground", className)}
    >
      {/* biome-ignore lint/a11y/useSemanticElements: <meter> ne porte pas de crans enfants ; role="meter" les regroupe (maquette 06 l.52) */}
      <span
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={reached}
        aria-valuetext={maturityText(reached, total)}
        className="inline-flex flex-wrap gap-[3px]"
      >
        {Array.from({ length: total }, (_, index) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: crans identiques, jamais réordonnés
            key={index}
            data-reached={index < reached ? "true" : "false"}
            className={cn(
              "h-1.5 w-2.5 rounded-[2px]",
              index < reached ? "bg-primary" : "bg-border-strong",
            )}
          />
        ))}
      </span>
      {maturityText(reached, total)}
    </span>
  );
}
