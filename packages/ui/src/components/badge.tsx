import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn.ts";
import { Pill, pillVariants } from "./pill.tsx";

/** @deprecated Utiliser `Pill`. Alias conservé pour les écrans non refondus (TK-141). */
export const badgeVariants = cva("", {
  variants: {
    variant: {
      default: pillVariants({ size: "sm", tone: "soft" }),
      outline: pillVariants({ size: "sm", tone: "outline" }),
      destructive: cn(
        pillVariants({ size: "sm", tone: "soft" }),
        "bg-destructive text-destructive-foreground",
      ),
    },
  },
  defaultVariants: { variant: "default" },
});

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

/** @deprecated Utiliser `Pill` : `default` = ton `soft`, `outline`, `destructive`, taille `sm`. */
export function Badge({ className, variant, ...props }: BadgeProps) {
  const tone = variant === "outline" ? "outline" : "soft";
  return (
    <Pill
      size="sm"
      tone={tone}
      className={cn(
        variant === "destructive" && "bg-destructive text-destructive-foreground",
        className,
      )}
      {...props}
    />
  );
}
