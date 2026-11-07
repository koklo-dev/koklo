import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn.ts";

export type IdTagProps = ComponentProps<"span"> & {
  tone?: "soft" | "outline";
  size?: "default" | "sm";
  /** `pill` : « Fournisseur · modèle », rond, bordure et fond `--surface`. */
  variant?: "tag" | "pill";
  /** Préfixe atténué de la variante `pill`. */
  prefix?: ReactNode;
};

const TONE = {
  soft: "bg-secondary text-secondary-foreground",
  outline: "border text-muted-foreground",
} as const;

function tagClass(tone: keyof typeof TONE, size: "default" | "sm", pill: boolean) {
  if (pill) return "h-[30px] gap-1.5 rounded-full border bg-surface px-3 text-code";
  return cn(
    "rounded-md px-1.5",
    TONE[tone],
    size === "sm" ? "h-5 text-code-sm" : "h-[22px] text-code",
  );
}

/** Identifiant en police mono (DESIGN.md §5.5) : ticket, écran, ou fournisseur et modèle. */
export function IdTag({
  tone = "soft",
  size = "default",
  variant = "tag",
  prefix,
  className,
  children,
  ...props
}: IdTagProps) {
  return (
    <span
      data-slot="id-tag"
      className={cn(
        "inline-flex items-center whitespace-nowrap font-mono",
        tagClass(tone, size, variant === "pill"),
        className,
      )}
      {...props}
    >
      {prefix && <span className="text-muted-foreground">{prefix}</span>}
      {children}
    </span>
  );
}
