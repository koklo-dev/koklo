"use client";

import { type ComponentProps, useId } from "react";
import { Icon } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { Input } from "./input.tsx";

type SearchFieldProps = Omit<ComponentProps<typeof Input>, "type" | "fieldSize" | "aria-label"> & {
  /** Nom accessible (label `sr-only`). */
  label: string;
  /** Si fourni, un bouton « Effacer » apparaît quand le champ a une valeur. */
  onClear?: () => void;
};

/** Champ de recherche : Input 36 avec loupe 18 en tête, label masqué visuellement. */
export function SearchField({ label, onClear, className, id, value, ...props }: SearchFieldProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const showClear = Boolean(onClear) && value !== undefined && String(value).length > 0;
  return (
    <div data-slot="search-field" className={cn("relative flex items-center", className)}>
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <Icon
        name="search"
        size={18}
        className="pointer-events-none absolute left-3 text-muted-foreground"
      />
      <Input
        id={inputId}
        type="search"
        fieldSize="sm"
        value={value}
        className={cn("pl-9.5 [&::-webkit-search-cancel-button]:hidden", showClear && "pr-9")}
        {...props}
      />
      {showClear ? (
        <button
          type="button"
          aria-label="Effacer"
          onClick={onClear}
          className="absolute right-1.5 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon name="close" size={16} />
        </button>
      ) : null}
    </div>
  );
}
