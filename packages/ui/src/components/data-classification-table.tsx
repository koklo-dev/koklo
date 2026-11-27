import { cn } from "../lib/cn.ts";
import { Button } from "./button.tsx";
import { Pill, type PillTone } from "./pill.tsx";

export type DataCategoryKind = "personal" | "contact" | "sensitive" | "secret" | "technical";

type PillSpec = { label: string; tone: PillTone };

/** Catégories d'une donnée (maquette 15 l.526). */
export const DATA_CATEGORY_PILL: Record<DataCategoryKind, PillSpec> = {
  personal: { label: "Personnelle", tone: "soft" },
  contact: { label: "Contact", tone: "soft" },
  sensitive: { label: "Santé ou sensible", tone: "warning" },
  secret: { label: "Secret", tone: "danger" },
  technical: { label: "Technique", tone: "outline" },
};
const UNCLASSIFIED: PillSpec = { label: "À classer", tone: "outline" };

export interface DataClassificationRow {
  /** Premier champ : identité de la ligne. */
  id: string;
  name: string;
  field: string;
  /** Absente : champ du modèle sans entrée. */
  category?: DataCategoryKind | undefined;
  retention: string;
  access: string;
  protection: string;
  /** Reste à décider : ligne ambre et « Décider ». */
  pending: boolean;
}

const HEADERS = [
  "Donnée",
  "Champ",
  "Catégorie",
  "Conservation",
  "Qui y accède",
  "Protection",
] as const;

function Row({
  row,
  onAction,
}: {
  row: DataClassificationRow;
  onAction: ((id: string) => void) | undefined;
}) {
  const category = row.category ? DATA_CATEGORY_PILL[row.category] : UNCLASSIFIED;
  const action = row.pending ? "Décider" : "Modifier";
  return (
    <tr
      data-spec-id={row.id}
      className={cn("border-t border-border", row.pending && "bg-status-pending/40")}
    >
      <td className="break-words px-3.5 py-2.5 font-medium">{row.name}</td>
      <td className="break-words px-2 py-2.5 font-mono text-code font-normal text-muted-foreground">
        {row.field}
      </td>
      <td className="px-2 py-2.5">
        <Pill size="sm" tone={category.tone}>
          {category.label}
        </Pill>
      </td>
      <td className="break-words px-2 py-2.5">{row.retention}</td>
      <td className="break-words px-2 py-2.5 text-muted-foreground">{row.access}</td>
      <td className="break-words px-2 py-2.5 text-muted-foreground">{row.protection}</td>
      <td className="px-3.5 py-2.5 text-right">
        {onAction ? (
          <Button
            type="button"
            size="sm"
            variant={row.pending ? "default" : "ghost"}
            className="h-[30px] max-md:h-11"
            aria-label={`${action} : ${row.id}`}
            onClick={() => onAction(row.id)}
          >
            {action}
          </Button>
        ) : null}
      </td>
    </tr>
  );
}

/**
 * Tableau des données sensibles (DESIGN.md §5.28, famille `EnvironmentTable`, maquette 15 l.161-166) : 980 px au moins
 * avec défilement dans son cadre focusable ; la ligne à décider est ambre et le dit (« Décider »). Sans `onAction`,
 * lecture seule.
 */
export function DataClassificationTable({
  rows,
  onAction,
}: {
  rows: readonly DataClassificationRow[];
  onAction?: ((id: string) => void) | undefined;
}) {
  return (
    <section
      data-slot="data-classification-table"
      aria-label="Tableau : Données sensibles"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: région défilante, atteignable au clavier
      tabIndex={0}
      // `relative` : le libellé masqué de la colonne d'action reste dans le cadre qui défile (375 px).
      className="relative min-w-0 overflow-auto rounded-xl border border-border outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <table className="w-full min-w-[980px] border-collapse text-meta">
        <caption className="sr-only">Données sensibles</caption>
        <thead>
          <tr className="bg-surface text-left text-caption text-muted-foreground">
            {HEADERS.map((label, index) => (
              <th
                key={label}
                scope="col"
                className={cn("py-[9px] font-medium", index === 0 ? "px-3.5" : "px-2")}
              >
                {label}
              </th>
            ))}
            <th scope="col" className="px-3.5 py-[9px]">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Row key={row.id} row={row} onAction={onAction} />
          ))}
        </tbody>
      </table>
    </section>
  );
}
