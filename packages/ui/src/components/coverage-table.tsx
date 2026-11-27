import { Pill, type PillTone } from "./pill.tsx";
import { ProgressBar } from "./progress-bar.tsx";

export type CoverageStatus = "covered" | "missing" | "to_check";

export interface CoverageRow {
  id: string;
  name: string;
  answered: number;
  total: number;
  /** Où c'est répondu ; vide : « — ». */
  where: string;
  status: CoverageStatus;
}

const pillOf = ({ status, total, answered }: CoverageRow): { label: string; tone: PillTone } => {
  if (status === "covered") return { label: "Couvert", tone: "success" };
  if (status === "to_check") return { label: "À vérifier", tone: "outline" };
  return { label: `${total - answered} sans réponse`, tone: "warning" };
};

function Row({ row }: { row: CoverageRow }) {
  const pill = pillOf(row);
  const share = row.total > 0 ? Math.round((row.answered / row.total) * 100) : 0;
  return (
    <tr className="border-t border-border">
      <th scope="row" className="px-3.5 py-2.5 text-left font-medium">
        {row.name}
      </th>
      <td className="px-2 py-2.5">
        <span className="flex items-center gap-2">
          {/* Barre décorative : la valeur est écrite à côté. */}
          <span aria-hidden="true" className="block w-[90px] shrink-0">
            <ProgressBar
              aria-label={row.name}
              value={share}
              tone={row.status === "missing" ? "warning" : "primary"}
            />
          </span>
          <span className="whitespace-nowrap">{`${row.answered} / ${row.total}`}</span>
        </span>
      </td>
      <td className="break-words px-2 py-2.5 text-muted-foreground">{row.where || "—"}</td>
      <td className="px-3.5 py-2.5">
        <Pill size="sm" tone={pill.tone}>
          {pill.label}
        </Pill>
      </td>
    </tr>
  );
}

/**
 * Couverture des exigences par chapitre (DESIGN.md §5.28, maquette 15 l.191-196) : 760 px au moins avec défilement
 * dans son cadre focusable.
 */
export function CoverageTable({ rows }: { rows: readonly CoverageRow[] }) {
  return (
    <section
      data-slot="coverage-table"
      aria-label="Tableau : Couverture par chapitre"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: région défilante, atteignable au clavier
      tabIndex={0}
      className="min-w-0 overflow-auto rounded-xl border border-border outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <table className="w-full min-w-[760px] border-collapse text-meta">
        <caption className="sr-only">Couverture par chapitre</caption>
        <thead>
          <tr className="bg-surface text-left text-caption text-muted-foreground">
            <th scope="col" className="px-3.5 py-[9px] font-medium">
              Chapitre
            </th>
            <th scope="col" className="min-w-[180px] px-2 py-[9px] font-medium">
              Exigences couvertes
            </th>
            <th scope="col" className="px-2 py-[9px] font-medium">
              Où c'est répondu
            </th>
            <th scope="col" className="px-3.5 py-[9px] font-medium">
              État
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Row key={row.id} row={row} />
          ))}
        </tbody>
      </table>
    </section>
  );
}
