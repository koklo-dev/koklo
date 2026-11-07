import type * as React from "react";
import { cn } from "../lib/cn.ts";

/** Classes communes aux champs de saisie (Input, Textarea) : bordure `--border`, désactivé pointillé. */
export const FIELD_BASE =
  "w-full min-w-0 rounded-lg border border-border bg-background px-3 text-body outline-none motion-safe:transition-[color,box-shadow] selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 disabled:cursor-not-allowed disabled:border-dashed disabled:border-border-strong disabled:bg-surface disabled:text-muted-foreground";

type InputProps = Omit<React.ComponentProps<"input">, "size"> & {
  /** Hauteur : `default` 40, `sm` 36. */
  fieldSize?: "default" | "sm";
  /** Police mono (clés, identifiants). */
  mono?: boolean;
};

function Input({ className, type, fieldSize = "default", mono = false, ...props }: InputProps) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        FIELD_BASE,
        fieldSize === "sm" ? "h-9" : "h-10",
        mono && "font-mono text-meta",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
