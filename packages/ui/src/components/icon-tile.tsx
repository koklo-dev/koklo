import type { ComponentProps } from "react";
import { Icon, type IconName, type IconSize } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";

export type IconTileSize = 28 | 32 | 34 | 36 | 40 | 48;
export type IconTileTone = "soft" | "primary" | "success" | "warning";

const SIZE: Record<IconTileSize, { box: string; icon: IconSize }> = {
  28: { box: "size-7 rounded-lg", icon: 18 },
  32: { box: "size-8 rounded-lg", icon: 18 },
  34: { box: "size-[34px] rounded-card", icon: 18 },
  36: { box: "size-9 rounded-card", icon: 20 },
  40: { box: "size-10 rounded-card", icon: 20 },
  48: { box: "size-12 rounded-xl", icon: 28 },
};

const TONE: Record<IconTileTone, string> = {
  soft: "bg-secondary text-secondary-foreground",
  primary: "bg-primary text-primary-foreground",
  success: "bg-status-validated text-status-validated-foreground",
  warning: "bg-status-pending text-status-pending-foreground",
};

export type IconTileProps = Omit<ComponentProps<"span">, "children"> & {
  icon: IconName;
  size?: IconTileSize;
  tone?: IconTileTone;
  /** Icône pleine (défaut) ; `false` : au contour (carte de livrable, maquette 07 l.136). */
  fill?: boolean;
};

/** Tuile d'icône décorative (DESIGN.md §5.5) : le sens est porté par le texte voisin. */
export function IconTile({
  icon,
  size = 36,
  tone = "soft",
  fill = true,
  className,
  ...props
}: IconTileProps) {
  return (
    <span
      data-slot="icon-tile"
      data-size={size}
      data-tone={tone}
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        SIZE[size].box,
        TONE[tone],
        className,
      )}
      {...props}
    >
      <Icon name={icon} size={SIZE[size].icon} fill={fill} />
    </span>
  );
}
