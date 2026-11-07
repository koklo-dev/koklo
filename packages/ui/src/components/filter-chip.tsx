"use client";

import { type ComponentProps, useState } from "react";
import { Icon } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";

const CHIP_BASE =
  "inline-flex items-center gap-1.5 whitespace-nowrap border motion-safe:transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-dashed disabled:border-border-strong disabled:bg-surface disabled:text-muted-foreground";

type FilterChipProps = Omit<ComponentProps<"button">, "onChange"> & {
  /** Pastille de filtre contrôlée ; sans elle, l'état est interne (`defaultPressed`). */
  pressed?: boolean;
  defaultPressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
  /** Compteur affiché après le libellé. */
  count?: number;
  /** « Ajouter un filtre » : pointillé, icône `add`, action sans état pressé. */
  add?: boolean;
};

/** Pastille de filtre h-7 (DESIGN.md §5.5) : bouton à bascule `aria-pressed`, ou action `add`. */
export function FilterChip({
  pressed,
  defaultPressed = false,
  onPressedChange,
  count,
  add = false,
  className,
  children,
  onClick,
  ...props
}: FilterChipProps) {
  const [inner, setInner] = useState(defaultPressed);
  const on = pressed ?? inner;
  return (
    <button
      type="button"
      data-slot="filter-chip"
      {...(add ? {} : { "aria-pressed": on })}
      className={cn(
        CHIP_BASE,
        "h-7 rounded-full px-3 text-caption",
        add && "border-dashed border-border-strong bg-transparent text-muted-foreground",
        !add && on && "border-primary bg-secondary text-secondary-foreground",
        !add && !on && "bg-background text-muted-foreground",
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        if (add || event.defaultPrevented) return;
        setInner(!on);
        onPressedChange?.(!on);
      }}
      {...props}
    >
      {add ? <Icon name="add" size={16} /> : null}
      {children}
      {count === undefined ? null : <span className="font-mono text-count">{count}</span>}
    </button>
  );
}

type OptionChipProps = Omit<ComponentProps<"button">, "onSelect"> & {
  selected?: boolean;
  onSelect?: () => void;
  /** Texte technique (identifiant de modèle) en police mono. */
  mono?: boolean;
};

/** Option de liste à choix h-8 (`role="option"`), à placer dans un `role="listbox"` nommé. */
export function OptionChip({
  selected = false,
  onSelect,
  mono = false,
  className,
  onClick,
  ...props
}: OptionChipProps) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      data-slot="option-chip"
      className={cn(
        CHIP_BASE,
        "h-8 rounded-full px-3 text-meta",
        mono && "font-mono",
        selected
          ? "border-2 border-primary bg-secondary text-secondary-foreground"
          : "bg-background",
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        onSelect?.();
      }}
      {...props}
    />
  );
}
