import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { Pill } from "./pill.tsx";

export type OperationType = "read" | "write" | "internal";

/** Libellé et ton par type d'opération (DESIGN.md §5.27, maquette 14 l.601). */
const KIND = {
  write: { label: "écriture", tone: "soft" },
  read: { label: "lecture", tone: "outline" },
  internal: { label: "interne", tone: "dashed" },
} as const;

/** Pastille du type d'une opération : 22 de haut, 72 de large, 11/500 (famille `Pill`). */
export function OperationKindPill({ type }: { type: OperationType }) {
  const { label, tone } = KIND[type];
  return (
    <Pill size="sm" tone={tone} className="w-[72px] shrink-0 justify-center text-code-sm">
      {label}
    </Pill>
  );
}

export interface OperationRowProps {
  /** `zone.verbe` : l'identifiant de l'opération. */
  name: string;
  summary: string;
  /** « public », « interne » ou la permission sans « PM- ». */
  permission: string;
  type: OperationType;
  current?: boolean;
  /** Visée par une proposition de l'agent : bord gauche pointillé. */
  proposed?: boolean;
  onSelect: () => void;
}

/** Ligne d'une opération (DESIGN.md §5.27, maquette 14 l.230) : bouton `aria-current`, bord haut sauf la première. */
export function OperationRow(props: OperationRowProps) {
  const { name, summary, permission, type, current = false, proposed, onSelect } = props;
  return (
    <div
      data-slot="operation-row"
      data-spec-id={name}
      className="border-t border-border first:border-t-0"
    >
      <button
        type="button"
        aria-current={current}
        onClick={onSelect}
        className={cn(
          "flex min-h-11 w-full items-center gap-3 px-3.5 py-[9px] text-left text-body text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          current ? "bg-secondary" : "bg-background",
          proposed && "border-l-[3px] border-dashed border-border-strong",
        )}
      >
        <OperationKindPill type={type} />{" "}
        <span className="flex min-w-0 flex-1 flex-col leading-[1.3]">
          <span className="break-all font-mono text-meta font-medium">{name}</span>{" "}
          <span className="truncate text-caption font-normal text-muted-foreground">{summary}</span>
        </span>{" "}
        <span className="max-w-[35%] break-all text-right font-mono text-code-sm text-muted-foreground">
          {permission}
        </span>
      </button>
    </div>
  );
}

/** Titre de la fiche d'une opération : son nom en mono 20/500 (DESIGN.md §5.27, maquette 14 l.240). */
export function OperationFicheTitle({ children }: { children: ReactNode }) {
  return <h2 className="m-0 break-all font-mono text-[20px] font-medium">{children}</h2>;
}
