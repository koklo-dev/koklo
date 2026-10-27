"use client";

import type { ComponentProps } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { Icon } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";

export function ResizablePanelGroup({ className, ...props }: ComponentProps<typeof Group>) {
  return <Group className={cn("flex h-full w-full", className)} {...props} />;
}

export function ResizablePanel(props: ComponentProps<typeof Panel>) {
  return <Panel {...props} />;
}

/** Séparateur 1 px focalisable ; `withHandle` ajoute une poignée visible. */
export function ResizableHandle({
  withHandle,
  className,
  ...props
}: ComponentProps<typeof Separator> & { withHandle?: boolean }) {
  return (
    <Separator
      className={cn(
        "relative flex shrink-0 items-center justify-center bg-border transition-colors duration-150 hover:bg-ring/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-[orientation=vertical]:w-px aria-[orientation=horizontal]:h-px aria-[orientation=vertical]:after:absolute aria-[orientation=vertical]:after:inset-y-0 aria-[orientation=vertical]:after:-left-1 aria-[orientation=vertical]:after:w-2 aria-[orientation=horizontal]:after:absolute aria-[orientation=horizontal]:after:inset-x-0 aria-[orientation=horizontal]:after:-top-1 aria-[orientation=horizontal]:after:h-2",
        className,
      )}
      {...props}
    >
      {withHandle ? (
        <div className="z-10 flex h-6 w-4 items-center justify-center rounded-sm border bg-border">
          <Icon name="drag_indicator" size={16} />
        </div>
      ) : null}
    </Separator>
  );
}
