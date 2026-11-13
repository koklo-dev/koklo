import { cn } from "../lib/cn.ts";
import type { DiagramPoint } from "../lib/diagram-layout.ts";

export interface DiagramRelation {
  id: string;
  from: string;
  to: string;
  /** Étiquette posée au milieu du trait (cardinalité en mono 11). */
  label?: string | undefined;
  /** Pointillés « 5 4 » (par exemple `n ↔ n`). */
  dashed?: boolean | undefined;
}

export interface DiagramRelationsProps {
  relations: readonly DiagramRelation[];
  /** Centre de chaque nœud, dans le repère du plan. */
  centers: Readonly<Record<string, DiagramPoint>>;
  selectedId: string | null | undefined;
  width: number;
  height: number;
}

interface Segment {
  relation: DiagramRelation;
  from: DiagramPoint;
  to: DiagramPoint;
  linked: boolean;
}

function segmentsOf({ relations, centers, selectedId }: DiagramRelationsProps): Segment[] {
  const segments: Segment[] = [];
  for (const relation of relations) {
    const from = centers[relation.from];
    const to = centers[relation.to];
    if (!from || !to) continue;
    const linked = selectedId === relation.from || selectedId === relation.to;
    segments.push({ relation, from, to, linked });
  }
  // Les traits liés à la sélection sont dessinés en dernier : ils passent au-dessus des autres.
  return segments.sort((a, b) => Number(a.linked) - Number(b.linked));
}

/**
 * Traits droits entre centres, sous les cartes (B420, maquette 11 l.398-403). Couche entière `aria-hidden` : les
 * relations se lisent dans la fiche de la table.
 */
export function DiagramRelations(props: DiagramRelationsProps) {
  const segments = segmentsOf(props);
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <svg
        aria-hidden="true"
        width={props.width}
        height={props.height}
        className="absolute inset-0"
      >
        {segments.map(({ relation, from, to, linked }) => (
          <line
            key={relation.id}
            data-relation={relation.id}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            strokeWidth={linked ? 2 : 1.5}
            strokeDasharray={relation.dashed ? "5 4" : undefined}
            className={linked ? "stroke-primary" : "stroke-border-strong"}
          />
        ))}
      </svg>
      {segments.map(({ relation, from, to, linked }) =>
        relation.label ? (
          <span
            key={relation.id}
            style={{ left: (from.x + to.x) / 2, top: (from.y + to.y) / 2 }}
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-[5px] border bg-background px-1.5 py-px font-mono text-code-sm",
              linked ? "border-primary text-primary" : "border-border text-muted-foreground",
            )}
          >
            {relation.label}
          </span>
        ) : null,
      )}
    </div>
  );
}
