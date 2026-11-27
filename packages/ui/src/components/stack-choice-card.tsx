import { type ReactNode, useId } from "react";
import type { IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { IconTile } from "./icon-tile.tsx";
import { Pill } from "./pill.tsx";

/** Couche de la stack (DESIGN.md §5.26, maquette 14 l.179-182) : titre en capitales, compte, grille de 2 colonnes. */
export function StackLayer({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} data-slot="stack-layer" className="flex flex-col gap-2">
      <h2
        id={id}
        className="m-0 flex items-center gap-2 text-caption font-semibold uppercase tracking-[0.06em] text-muted-foreground"
      >
        {label} <span className="font-mono font-medium tracking-normal">{count}</span>
      </h2>
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">{children}</div>
    </section>
  );
}

export type StackChoiceStatus = "chosen" | "open";

export const STACK_STATUS_PILL = {
  chosen: { label: "Choisi", tone: "success" },
  open: { label: "À trancher", tone: "warning" },
} as const;

export interface StackChoiceCardProps {
  id: string;
  /** Rôle de l'architecture que le choix remplit. */
  roleName: string;
  /** Produit retenu, ou « À trancher ». */
  choice: string;
  /** « Pour C-portail, C-api +1 » ou « Pour toute l'équipe ». */
  forText: string;
  status: StackChoiceStatus;
  icon: IconName;
  selected?: boolean;
  /** Concerné par un changement en amont : contour ambre de 2 px. */
  stale?: boolean;
  /** Proposé par l'agent, pas encore enregistré : contour pointillé. */
  proposed?: boolean;
  onSelect: () => void;
}

/** Contour de la carte (maquette 14 l.570) : choisie, sinon à revoir, sinon proposée, sinon neutre. */
function frameClass({ selected, stale, proposed }: Partial<StackChoiceCardProps>): string {
  if (selected) return "border-2 border-primary shadow-floating";
  if (stale) return "border-2 border-status-pending-icon";
  return proposed ? "border border-dashed border-border-strong" : "border border-border";
}

/** Carte d'un choix technique (DESIGN.md §5.26, maquette 14 l.183-187) : bouton `aria-pressed`. */
export function StackChoiceCard(props: StackChoiceCardProps) {
  const { id, roleName, choice, forText, status, icon, selected = false, stale, onSelect } = props;
  const pill = STACK_STATUS_PILL[status];
  return (
    <button
      type="button"
      data-slot="stack-choice-card"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full min-w-0 flex-col gap-2 rounded-xl bg-background px-3.5 py-3 text-left text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring",
        frameClass(props),
      )}
    >
      <span className="flex items-center gap-2.5">
        <IconTile
          icon={icon}
          size={34}
          fill={false}
          tone={selected ? "primary" : "soft"}
          className="rounded-lg"
        />
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="text-caption font-normal text-muted-foreground">{roleName}</span>{" "}
          <span className="break-words text-card-title">{choice}</span>
        </span>
      </span>{" "}
      <span className="break-words text-caption font-normal text-muted-foreground">{forText}</span>{" "}
      <span className="flex items-center gap-2">
        <Pill tone={pill.tone}>{pill.label}</Pill>{" "}
        <span className="min-w-0 flex-1 truncate text-right font-mono text-code-sm font-normal text-muted-foreground">
          {id}
        </span>
      </span>
      {stale ? <span className="sr-only">, à revoir</span> : null}
    </button>
  );
}

/** Titre de la fiche d'un choix : le produit retenu en 22/600 (DESIGN.md §5.26, maquette 14 l.190). */
export function StackFicheTitle({ children }: { children: ReactNode }) {
  return <h2 className="m-0 break-words text-[22px] font-semibold leading-snug">{children}</h2>;
}
