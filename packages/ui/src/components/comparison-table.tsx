import { cn } from "../lib/cn.ts";

export interface ComparisonCriterion {
  label: string;
  /** Une valeur par option, dans l'ordre des options. */
  values: readonly string[];
  /** Valeurs estimées (préfixées « ≈ ») : une note les signale. */
  estimate?: boolean | undefined;
}

export interface ComparisonTableProps {
  options: readonly string[];
  criteria: readonly ComparisonCriterion[];
  /** Colonne retenue ou recommandée, avec son étiquette sous le nom. */
  highlight?: { option: string; tag: "Choisi" | "Recommandé" } | undefined;
}

const isEstimated = ({ estimate, values }: ComparisonCriterion): boolean =>
  Boolean(estimate) || values.some((value) => value.startsWith("≈"));

const CELL = "px-2.5 py-[7px]";
const MARKED = "bg-secondary text-secondary-foreground";

function Head({ options, highlight }: Pick<ComparisonTableProps, "options" | "highlight">) {
  return (
    <thead>
      <tr className="bg-surface text-left">
        <th scope="col" className="px-2.5 py-2 font-medium text-muted-foreground">
          Critère
        </th>
        {options.map((option) => {
          const marked = highlight?.option === option;
          return (
            <th
              key={option}
              scope="col"
              className={cn("px-2.5 py-2 font-semibold", marked && MARKED)}
            >
              {option}
              {marked ? (
                <span className="block text-[10px] font-semibold text-primary">
                  {highlight.tag}
                </span>
              ) : null}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

/**
 * Tableau comparatif des options d'un choix (DESIGN.md §5.26, maquette 14 l.202-207) : critères en lignes, colonne
 * retenue ou recommandée mise en avant, défilement dans son cadre focusable.
 */
export function ComparisonTable({ options, criteria, highlight }: ComparisonTableProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <section
        aria-label="Tableau comparatif des options"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: région défilante, atteignable au clavier
        tabIndex={0}
        data-slot="comparison-table"
        className="overflow-auto rounded-[10px] border border-border outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <table className="w-full border-collapse text-caption font-normal">
          <caption className="sr-only">Options comparées</caption>
          <Head options={options} highlight={highlight} />
          <tbody>
            {criteria.map((criterion) => (
              <tr key={criterion.label} className="border-t border-border">
                <th scope="row" className={cn(CELL, "text-left font-medium")}>
                  {criterion.label}
                </th>
                {options.map((option, index) => (
                  <td
                    key={option}
                    className={cn(
                      CELL,
                      highlight?.option === option && ["bg-secondary", "font-semibold"],
                    )}
                  >
                    {criterion.values[index] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {criteria.some(isEstimated) ? (
        <p className="m-0 text-caption font-normal text-muted-foreground">
          ≈ : estimations à vérifier
        </p>
      ) : null}
    </div>
  );
}
