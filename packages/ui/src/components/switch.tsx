"use client";

import { Switch as SwitchPrimitive } from "radix-ui";
import { type ComponentProps, type ReactNode, useId } from "react";
import { cn } from "../lib/cn.ts";

/** Interrupteur 38x22 (DESIGN.md §5.5) ; le désactivé garde `opacity-60` (maquette 24:252). */
export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full bg-border-strong p-[3px] outline-none motion-safe:transition-colors duration-150 data-[state=checked]:bg-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-4 rounded-full bg-switch-thumb motion-safe:transition-transform duration-150 data-[state=checked]:translate-x-4" />
    </SwitchPrimitive.Root>
  );
}

type SwitchRowProps = Omit<ComponentProps<typeof Switch>, "title"> & {
  title: ReactNode;
  description?: ReactNode;
};

/** Ligne d'interrupteur : titre et description reliés, hauteur tactile 44. */
export function SwitchRow({ title, description, className, id, ...props }: SwitchRowProps) {
  const auto = useId();
  const switchId = id ?? auto;
  return (
    <div
      data-slot="switch-row"
      className={cn("flex min-h-11 items-center justify-between gap-4", className)}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <label htmlFor={switchId} className="text-body font-medium">
          {title}
        </label>
        {description ? (
          <p id={`${switchId}-desc`} className="text-caption font-normal text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      <Switch
        id={switchId}
        aria-describedby={description ? `${switchId}-desc` : undefined}
        {...props}
      />
    </div>
  );
}
