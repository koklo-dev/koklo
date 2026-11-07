"use client";

import { type SVGAttributes, useEffect, useReducer } from "react";
import { cn } from "../lib/cn.ts";
import { loadIcon, readIcon } from "./cache.ts";
import type { IconName } from "./generated/registry.ts";

export type { IconName };

/** Échelle de tailles de DESIGN.md §4 (14 pastille, 16 badge, 18 statut, 20 bouton, 22 navigation, 24 étape, 28 galerie). */
export type IconSize = 14 | 16 | 18 | 20 | 22 | 24 | 28;

/** Tons de DESIGN.md §4 ; sans `tone`, l'icône hérite `currentColor`. */
export type IconTone = "muted" | "primary" | "success" | "danger";

const TONE_CLASS: Record<IconTone, string> = {
  muted: "text-muted-foreground",
  primary: "text-primary",
  success: "text-status-validated-foreground",
  danger: "text-destructive",
};

export interface IconProps
  extends Omit<SVGAttributes<SVGSVGElement>, "width" | "height" | "viewBox" | "fill" | "name"> {
  name: IconName;
  size?: IconSize;
  tone?: IconTone;
  /** Remplissage 1 : état actif et statuts. Contour (0) par défaut. */
  fill?: boolean;
  /** Rend l'icône porteuse de sens (role img) ; sans nom, elle reste décorative. */
  title?: string;
}

/** Material Symbols Rounded 400 en SVG, chargé à la demande ; jamais la police d'icônes. */
export function Icon({
  name,
  size = 20,
  tone,
  fill = false,
  title,
  className,
  ...rest
}: IconProps) {
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  const paths = readIcon(name);

  useEffect(() => {
    if (readIcon(name)) return;
    let active = true;
    loadIcon(name)
      .then(() => active && refresh())
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [name]);

  const labelled = Boolean(title || rest["aria-label"] || rest["aria-labelledby"]);
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: décoratif par défaut, nommé via title ou aria-label
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 -960 960 960"
      fill="currentColor"
      data-icon={name}
      className={cn("shrink-0", tone && TONE_CLASS[tone], className)}
      {...(labelled ? { role: "img" } : { "aria-hidden": true, focusable: false })}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {paths ? <path d={fill ? paths.filled : paths.outline} /> : null}
    </svg>
  );
}
