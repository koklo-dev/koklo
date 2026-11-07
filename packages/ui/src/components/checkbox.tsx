"use client";

import { Checkbox as CheckboxPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { Icon } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";

/** Case à cocher : glyphe 20 dans une cible de 28 px (WCAG 2.5.8), indéterminé = `aria-checked="mixed"`. */
export function Checkbox({
  className,
  checked,
  ...props
}: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      checked={checked}
      className={cn(
        "group inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:text-border data-[state=checked]:text-primary data-[state=indeterminate]:text-primary",
        className,
      )}
      {...props}
    >
      <Icon
        name="check_box_outline_blank"
        size={20}
        className="group-data-[state=checked]:hidden group-data-[state=indeterminate]:hidden"
      />
      <Icon name="check_box" size={20} fill className="hidden group-data-[state=checked]:block" />
      <span
        aria-hidden="true"
        className="hidden size-5 items-center justify-center rounded-sm bg-primary text-primary-foreground group-data-[state=indeterminate]:flex"
      >
        <Icon name="remove" size={16} />
      </span>
    </CheckboxPrimitive.Root>
  );
}
