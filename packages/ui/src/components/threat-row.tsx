import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { Pill, type PillTone } from "./pill.tsx";

export type ThreatGravity = "high" | "medium" | "low";
export type ThreatState = "ok" | "todo" | "proposed" | "stale";

type PillSpec = { label: string; tone: PillTone };

/** Titre de la fiche d'une menace (maquette 15 l.139) : h2 20/600. */
export function ThreatFicheTitle({ children }: { children: ReactNode }) {
  return <h2 className="m-0 break-words text-xl font-semibold leading-tight">{children}</h2>;
}

/** Gravité d'une menace (maquette 15 l.498) : « Élevée » rouge, les autres au contour. */
export const THREAT_GRAVITY_PILL: Record<ThreatGravity, PillSpec> = {
  high: { label: "Élevée", tone: "danger" },
  medium: { label: "Moyenne", tone: "outline" },
  low: { label: "Faible", tone: "outline" },
};

/** État d'une menace (maquette 15 l.497). */
export const THREAT_STATE_PILL: Record<ThreatState, PillSpec> = {
  ok: { label: "Traitée", tone: "success" },
  todo: { label: "À traiter", tone: "warning" },
  proposed: { label: "Proposée", tone: "proposed" },
  stale: { label: "À revoir", tone: "warning" },
};

export type ThreatRowProps = Omit<ComponentProps<"button">, "children" | "title" | "type"> & {
  threatId: string;
  title: string;
  gravity: ThreatGravity;
  state: ThreatState;
  /** Menace dont la fiche est ouverte. */
  current?: boolean;
};

/**
 * Ligne d'une menace (DESIGN.md §5.28, maquette 15 l.132) : identifiant mono sur 66, titre, gravité puis état. Le nom
 * accessible porte les deux ; la couleur double toujours un libellé. Une seule ligne à toute largeur : le titre seul passe
 * à la ligne.
 */
export function ThreatRow({
  threatId,
  title,
  gravity,
  state,
  current = false,
  className,
  ...props
}: ThreatRowProps) {
  const grave = THREAT_GRAVITY_PILL[gravity];
  const status = THREAT_STATE_PILL[state];
  return (
    <button
      type="button"
      data-slot="threat-row"
      {...(current ? { "aria-current": "true" as const } : {})}
      className={cn(
        "flex min-h-11 w-full items-center gap-x-2.5 border-t border-border bg-background px-3.5 py-1.5 text-left outline-none first:border-t-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset aria-[current=true]:bg-secondary",
        className,
      )}
      {...props}
    >
      <span className="w-[66px] shrink-0 font-mono text-code">{threatId}</span>{" "}
      <span className="min-w-0 flex-1 break-words text-meta font-medium">{title}</span>{" "}
      <span className="sr-only">Gravité</span>{" "}
      <Pill size="sm" tone={grave.tone}>
        {grave.label}
      </Pill>{" "}
      <Pill size="sm" tone={status.tone}>
        {status.label}
      </Pill>
    </button>
  );
}
