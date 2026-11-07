import { Icon, type IconProps } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";

export interface SpinnerProps {
  size?: 16 | 18 | 20;
  /** `primary` (défaut) ou `current` pour hériter la couleur du bouton qui le porte. */
  tone?: "primary" | "current";
  className?: string;
}

/**
 * Indicateur de chargement décoratif (`progress_activity`), tournant sous `motion-safe:`.
 * L'état est annoncé par `aria-busy` du conteneur, jamais par le spinner.
 */
export function Spinner({ size = 16, tone = "primary", className }: SpinnerProps) {
  const iconSize: IconProps["size"] = size;
  return (
    <span
      data-slot="spinner"
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 motion-safe:animate-spin",
        tone === "primary" ? "text-primary" : "text-current",
        className,
      )}
    >
      <Icon name="progress_activity" size={iconSize} />
    </span>
  );
}
