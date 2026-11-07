import type { ComponentProps } from "react";
import { cn } from "../lib/cn.ts";

/** Touche de raccourci : mono 11/500, hauteur 18, bordure `--border` (DESIGN.md §5.5). */
export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-[18px] items-center rounded-sm border bg-background px-[5px] font-mono text-code-sm text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
