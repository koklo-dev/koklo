import type { ComponentProps } from "react";
import { Icon, type IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { Button } from "./button.tsx";

/** `Omit` distribué sur l'union de `ButtonProps`, pour garder l'exclusion `asChild` / `disabledReason`. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type IconButtonProps = DistributiveOmit<
  ComponentProps<typeof Button>,
  "size" | "children" | "aria-label" | "icon" | "shortcut" | "loading"
> & {
  icon: IconName;
  /** Nom accessible, obligatoire : le bouton n'a pas de texte visible. */
  "aria-label": string;
  /** `default` 36 (icône 20) ou `sm` 32 (icône 18, rayon 6). */
  size?: "default" | "sm";
  /** `primary` : bouton d'envoi 32, rayon 8, fond `--primary`. */
  tone?: "primary";
};

/** Bouton carré portant une seule icône décorative (DESIGN.md §5.5). */
export function IconButton({
  icon,
  size = "default",
  tone,
  variant,
  className,
  ...props
}: IconButtonProps) {
  const compact = size === "sm" || tone === "primary";
  return (
    <Button
      size="icon"
      variant={variant ?? (tone === "primary" ? "default" : "ghost")}
      className={cn(
        compact && "size-8",
        tone === "primary" && "rounded-lg",
        !variant && !tone && "text-muted-foreground",
        className,
      )}
      {...props}
    >
      <Icon name={icon} size={compact ? 18 : 20} />
    </Button>
  );
}
