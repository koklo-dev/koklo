import type { CSSProperties } from "react";
import { Icon, type IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";

/** Type d'un nœud du schéma : l'acteur (rôle `RL-`) et les types de composant. */
export type ArchNodeKind = "actor" | "app" | "service" | "store" | "queue" | "ext";

/** Libellé du type, toujours écrit : la forme et la couleur ne portent jamais le sens seules (WCAG 1.4.1). */
export const ARCH_NODE_LABELS: Record<ArchNodeKind, string> = {
  actor: "Acteur",
  app: "Application",
  service: "Service",
  store: "Stockage",
  queue: "File de tâches",
  ext: "Externe",
};

/** Largeur et hauteur par type (maquette 13 l.576-583). */
const SIZES: Record<ArchNodeKind, { width: number; height: number }> = {
  actor: { width: 160, height: 52 },
  app: { width: 220, height: 70 },
  service: { width: 200, height: 70 },
  store: { width: 170, height: 64 },
  queue: { width: 170, height: 64 },
  ext: { width: 170, height: 64 },
};

/** Taille d'un nœud pour le placement du lecteur. */
export const archNodeSize = (kind: ArchNodeKind): { width: number; height: number } => SIZES[kind];

const ICONS: Record<ArchNodeKind, IconName> = {
  actor: "person",
  app: "desktop_windows",
  service: "hub",
  store: "database",
  queue: "lists",
  ext: "cloud",
};

export interface ArchNodeCardProps {
  kind: ArchNodeKind;
  name: string;
  /** Icône propre au nœud (le registre en offre dix) ; celle du type par défaut. */
  icon?: IconName | undefined;
  /** Ligne sous le nom ; le libellé du type par défaut. */
  subtitle?: string | undefined;
  selected?: boolean | undefined;
  /** Proposition à relire : contour en pointillés, doublé d'un texte dans le nom accessible. */
  pending?: boolean | undefined;
  /** Zoom sous 60 % : seul le nom reste. */
  compact?: boolean | undefined;
  /** Nœud d'une autre zone : estompé, rond sans `aria-pressed`, il ouvre l'autre zone. */
  ghost?: boolean | undefined;
  onSelect?: (() => void) | undefined;
  style?: CSSProperties | undefined;
  className?: string | undefined;
}

const SHAPE: Record<ArchNodeKind, string> = {
  actor: "rounded-full",
  app: "rounded-[10px]",
  service: "rounded-[10px]",
  store: "rounded-[14px]",
  queue: "rounded-[10px]",
  ext: "rounded-[10px]",
};

/** Contour : `--primary` de 2 px et ombre pour la sélection, sinon 1 px, en pointillés pour un externe, une proposition ou une autre zone. */
function borderOf(
  kind: ArchNodeKind,
  { selected, dashed }: { selected: boolean; dashed: boolean },
) {
  if (selected) return "border-2 border-primary shadow-floating";
  return cn(
    "border",
    kind === "ext" ? "border-dashed border-border-strong" : "border-border",
    dashed && "border-dashed",
  );
}

/**
 * Nœud d'un schéma d'architecture (DESIGN.md §5.23, maquette 13 l.683-690) : forme par type (pilule pour l'acteur,
 * angles de 14 pour les données et les files, pointillé `--border-strong` pour l'externe), tuile d'icône de 32, nom en
 * 13/600 et type en 11. Un `button` vide recouvre la carte : son nom répète le type et le nom, le contenu visuel est
 * masqué aux lecteurs d'écran. Un nœud d'une autre zone (`ghost`) n'a pas d'état pressé.
 */
export function ArchNodeCard({
  kind,
  name,
  icon,
  subtitle,
  selected = false,
  pending = false,
  compact = false,
  ghost = false,
  onSelect,
  style,
  className,
}: ArchNodeCardProps) {
  const type = ARCH_NODE_LABELS[kind];
  const size = SIZES[kind];
  const actor = kind === "actor";
  const tile = actor ? "size-7 rounded-full" : "size-8 rounded-lg";
  const border = borderOf(kind, { selected, dashed: pending || ghost });
  return (
    <div
      data-slot="arch-node"
      data-kind={kind}
      style={{ width: size.width, height: compact ? 44 : size.height, ...style }}
      className={cn(
        "relative flex max-w-full items-center gap-2.5 px-3 text-left text-foreground",
        SHAPE[kind],
        border,
        kind === "ext" ? "bg-surface" : "bg-background",
        ghost && "opacity-70",
        className,
      )}
    >
      <button
        type="button"
        {...(ghost ? {} : { "aria-pressed": selected })}
        aria-label={
          [type, name].join(" ") + (pending ? ", à relire" : "") + (ghost ? ", autre zone" : "")
        }
        onClick={onSelect}
        className="absolute inset-0 z-10 cursor-pointer rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      />
      <span aria-hidden="true" className="contents">
        <span
          data-slot="arch-tile"
          className={cn(
            "flex shrink-0 items-center justify-center",
            tile,
            selected
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground",
          )}
        >
          <Icon name={icon ?? ICONS[kind]} size={18} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-meta font-semibold">{name}</span>
          {compact || actor ? null : (
            <span className="truncate text-[11px] text-muted-foreground">{subtitle ?? type}</span>
          )}
        </span>
      </span>
    </div>
  );
}
