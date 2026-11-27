import { useId } from "react";
import { cn } from "../lib/cn.ts";

export interface OperationFieldsTableProps {
  /** « Entrée », « Sortie », « Erreurs ». */
  title: string;
  columns: readonly [string, string, string];
  /** Une ligne par champ ou par erreur ; la première cellule en est la clé. */
  rows: ReadonlyArray<readonly [string, string, string]>;
}

const CELL = "px-2.5 py-1.5 align-top";
const CELL_STYLE = ["font-mono font-medium", "font-mono text-muted-foreground", ""] as const;

/**
 * Champs d'une opération (DESIGN.md §5.27, maquette 14 l.243-246) : titre, table de trois colonnes (nom mono, type mono
 * muet, texte), défilement dans son cadre focusable.
 */
export function OperationFieldsTable({ title, columns, rows }: OperationFieldsTableProps) {
  const id = useId();
  return (
    <div data-slot="operation-fields-table" className="flex min-w-0 flex-col gap-1.5">
      <h3 id={id} className="m-0 text-meta font-semibold">
        {title}
      </h3>
      <section
        aria-label={`Tableau ${title}`}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: région défilante, atteignable au clavier
        tabIndex={0}
        className="overflow-auto rounded-[10px] border border-border outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <table aria-labelledby={id} className="w-full border-collapse text-caption font-normal">
          <thead>
            <tr className="bg-surface text-left text-muted-foreground">
              {columns.map((column) => (
                <th key={column} scope="col" className={cn(CELL, "font-medium")}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, line) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: les lignes suivent l'ordre du fichier
              <tr key={`${row[0]}-${line}`} className="border-t border-border">
                {CELL_STYLE.map((style, index) => (
                  <td key={columns[index]} className={cn(CELL, style)}>
                    {row[index]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
