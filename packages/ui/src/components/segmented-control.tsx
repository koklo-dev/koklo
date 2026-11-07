"use client";

import { type KeyboardEvent, useRef, useState } from "react";
import { Icon, type IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";

export type SegmentedOption<V extends string = string> = {
  value: V;
  label: string;
  icon?: IconName;
};

type SegmentedControlProps<V extends string> = {
  options: ReadonlyArray<SegmentedOption<V>>;
  value?: V;
  defaultValue?: V;
  onValueChange?: (value: V) => void;
  /** `pressed` : boutons `aria-pressed` (groupe) ; `radio` : `radiogroup` avec flèches. */
  mode?: "pressed" | "radio";
  size?: "default" | "xs";
  className?: string;
  "aria-label": string;
};

/** Contrôle segmenté (DESIGN.md §5.5) : actif neutre `--background` + anneau `--border`, jamais violet. */
export function SegmentedControl<V extends string>({
  options,
  value,
  defaultValue,
  onValueChange,
  mode = "pressed",
  size = "default",
  className,
  "aria-label": ariaLabel,
}: SegmentedControlProps<V>) {
  const [inner, setInner] = useState<V | undefined>(defaultValue ?? options[0]?.value);
  const current = value ?? inner;
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const radio = mode === "radio";

  const select = (next: V) => {
    setInner(next);
    onValueChange?.(next);
  };
  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!radio || step === undefined) return;
    event.preventDefault();
    const target = (index + step + options.length) % options.length;
    refs.current[target]?.focus();
    const next = options[target];
    if (next) select(next.value);
  };

  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: rôle dynamique group|radiogroup, tous deux nommables
    <div
      role={radio ? "radiogroup" : "group"}
      aria-label={ariaLabel}
      data-slot="segmented-control"
      className={cn(
        "inline-flex max-w-full gap-0.5 rounded-lg border bg-surface p-[3px]",
        className,
      )}
    >
      {options.map((option, index) => {
        const active = option.value === current;
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            {...(radio
              ? { role: "radio", "aria-checked": active, tabIndex: active ? 0 : -1 }
              : { "aria-pressed": active })}
            onClick={() => select(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-caption outline-none motion-safe:transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
              size === "xs" ? "h-6" : "h-[26px]",
              active
                ? "bg-background text-foreground ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.icon ? <Icon name={option.icon} size={16} /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
