import type { ComponentProps } from "react";
import { cn } from "../lib/cn.ts";

export type ProjectTileSize = 22 | 36 | 40;
export type ProjectColorKey = 1 | 2 | 3 | 4 | 5;

const HUE: Record<ProjectColorKey, string> = {
  1: "bg-hue-1 text-hue-1-foreground",
  2: "bg-hue-2 text-hue-2-foreground",
  3: "bg-hue-3 text-hue-3-foreground",
  4: "bg-hue-4 text-hue-4-foreground",
  5: "bg-hue-5 text-hue-5-foreground",
};

/** 22 : barre (rayon 6, 10/700) ; 36 : carte de création ; 40 : carte (rayon 10, 14/700). */
const SIZE: Record<ProjectTileSize, string> = {
  22: "size-[22px] rounded-md text-[10px]",
  36: "size-9 rounded-card text-body",
  40: "size-10 rounded-card text-body",
};

export type ProjectTileProps = Omit<ComponentProps<"span">, "children"> & {
  initials: string;
  /** Teinte 1 à 5, choisie par le serveur (`colorKey`). */
  colorKey: ProjectColorKey;
  size?: ProjectTileSize;
  /** `soft` : tuile neutre `--secondary` (carte de création, maquette 08 l.87) au lieu de la teinte du projet. */
  tone?: "hue" | "soft";
};

/** Tuile aux initiales d'un projet (DESIGN.md §5.12, maquette 08 l.99 et l.40) : décorative, le nom est écrit à côté. */
export function ProjectTile({
  initials,
  colorKey,
  size = 40,
  tone = "hue",
  className,
  ...props
}: ProjectTileProps) {
  return (
    <span
      data-slot="project-tile"
      data-size={size}
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center font-bold",
        SIZE[size],
        tone === "soft" ? "bg-secondary text-secondary-foreground" : HUE[colorKey],
        className,
      )}
      {...props}
    >
      {initials}
    </span>
  );
}
