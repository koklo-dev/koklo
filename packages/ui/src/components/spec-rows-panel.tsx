import { useId } from "react";
import { Icon, type IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { Pill, type PillTone } from "./pill.tsx";

export interface SpecPanelRow {
  name: string;
  usage: string;
  pill: { label: string; tone: PillTone };
}

export interface SpecRowsPanelProps {
  icon: IconName;
  title: string;
  /** Précision à droite du titre. */
  note?: string;
  /** Noms en police mono (noms de variables). */
  mono?: boolean;
  rows: readonly SpecPanelRow[];
  emptyText?: string;
}

/**
 * Panneau de lignes de la spec (DESIGN.md §5.26, maquette 14 l.289-297) : en-tête à icône, puis nom, usage et pastille
 * par ligne. Le tableau défile dans son cadre focusable quand il ne tient pas.
 */
export function SpecRowsPanel({
  icon,
  title,
  note,
  mono = false,
  rows,
  emptyText,
}: SpecRowsPanelProps) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      data-slot="spec-rows-panel"
      className="min-w-0 self-start overflow-hidden rounded-xl border border-border"
    >
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <Icon name={icon} size={18} tone="muted" />
        <h2 id={id} className="m-0 text-subsection-title">
          {title}
        </h2>
        <span className="flex-1" />
        {note ? (
          <span className="text-caption font-normal text-muted-foreground">{note}</span>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="m-0 border-t border-border px-4 py-3 text-meta text-muted-foreground">
          {emptyText}
        </p>
      ) : (
        <div
          // biome-ignore lint/a11y/noNoninteractiveTabindex: cadre défilant, atteignable au clavier
          tabIndex={0}
          className="overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <table aria-labelledby={id} className="w-full border-collapse text-meta">
            <tbody>
              {rows.map((row) => (
                <tr key={row.name} className="border-t border-border">
                  <td className={cn("px-4 py-2", mono ? "font-mono text-code" : "font-medium")}>
                    {row.name}
                  </td>
                  <td className="p-2 text-muted-foreground">{row.usage}</td>
                  <td className="px-4 py-2 text-right">
                    <Pill size="md" tone={row.pill.tone} className="h-[22px]">
                      {row.pill.label}
                    </Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
