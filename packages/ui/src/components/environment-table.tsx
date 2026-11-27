import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";

export interface EnvironmentColumn {
  id: string;
  name: string;
}

export interface EnvironmentRow {
  label: string;
  /** Une valeur par colonne, dans l'ordre ; absente : « — ». */
  values: ReadonlyArray<string | undefined>;
  mono?: boolean;
}

export interface EnvironmentTableProps {
  title: string;
  columns: readonly EnvironmentColumn[];
  rows: readonly EnvironmentRow[];
  /** Action de la légende (« Modifier »), hors de la région défilante. */
  action?: ReactNode;
}

/** Pastilles des colonnes (maquette 14 l.675) : neutre, ambre, verte, puis neutre. */
const DOTS = ["bg-border-strong", "bg-status-pending-icon", "bg-status-validated-foreground"];

const OPEN = "à trancher";

function Cell({ value, mono }: { value: string | undefined; mono: boolean }) {
  const open = value?.toLowerCase().includes(OPEN) ?? false;
  return (
    <td
      className={cn(
        "break-words px-3 py-2.5 align-top text-meta",
        mono && "font-mono text-code font-normal",
        open && "font-semibold text-status-pending-foreground",
      )}
    >
      {value ?? "—"}
    </td>
  );
}

/**
 * Tableau des environnements (DESIGN.md §5.26, maquette 14 l.282-288) : légende et action au-dessus, une colonne par
 * environnement, 720 px au moins avec défilement dans son cadre focusable ; la couleur double toujours un libellé.
 */
export function EnvironmentTable({ title, columns, rows, action }: EnvironmentTableProps) {
  return (
    <div data-slot="environment-table" className="min-w-0 rounded-xl border border-border">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span aria-hidden="true" className="flex-1 text-subsection-title">
          {title}
        </span>
        {action}
      </div>
      <section
        aria-label={`Tableau : ${title}`}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: région défilante, atteignable au clavier
        tabIndex={0}
        className="overflow-auto rounded-b-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <table className="w-full min-w-[720px] border-collapse text-body">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="bg-surface text-left text-caption">
              <td className="w-[180px] px-4 py-2.5" />
              {columns.map((column, index) => (
                <th key={column.id} scope="col" className="px-3 py-2.5 font-semibold">
                  <span className="inline-flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      data-slot="env-dot"
                      className={cn("size-2 rounded-full", DOTS[index] ?? "bg-border-strong")}
                    />
                    {column.name}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-border">
                <th
                  scope="row"
                  className="px-4 py-2.5 text-left align-top text-meta font-medium text-muted-foreground"
                >
                  {row.label}
                </th>
                {columns.map((column, index) => (
                  <Cell key={column.id} value={row.values[index]} mono={row.mono ?? false} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
