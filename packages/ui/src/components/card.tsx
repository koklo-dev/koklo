import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn.ts";

const PANEL = "rounded-xl border bg-background px-[18px] py-4";

const cardVariants = cva("text-card-foreground", {
  variants: {
    variant: {
      panel: PANEL,
      inset: "rounded-card border bg-surface px-3.5 py-3",
      interactive: `${PANEL} block text-left motion-safe:transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`,
      proposal: "rounded-xl border border-dashed border-primary bg-diff-bg p-[18px]",
      dashed: "rounded-xl border border-dashed border-border-strong bg-background px-[18px] py-4",
      warning: "rounded-xl border border-alert-warning-border bg-background px-[18px] py-4",
    },
  },
  defaultVariants: { variant: "panel" },
});

export type CardVariant = NonNullable<VariantProps<typeof cardVariants>["variant"]>;

export type CardProps = ComponentProps<"div"> & {
  variant?: CardVariant;
  /** `interactive` : la carte entière est le lien ou le bouton passé en enfant. */
  asChild?: boolean;
  /** `interactive` : élément choisi, bordure `--primary` et `aria-current`. */
  selected?: boolean;
};

/**
 * Surface de contenu (DESIGN.md §5.6) : `panel` par défaut (rayon 12, marges 16 / 18). Une carte
 * `interactive` s'utilise avec `asChild` sur un `a` ou un `button` : le clavier et le focus viennent de lui.
 */
export function Card({ variant = "panel", asChild, selected, className, ...props }: CardProps) {
  const Comp = asChild ? Slot.Root : "div";
  return (
    <Comp
      data-slot="card"
      data-variant={variant}
      aria-current={selected ? "true" : undefined}
      className={cn(cardVariants({ variant }), selected && "border-primary", className)}
      {...props}
    />
  );
}

export type CardHeaderProps = ComponentProps<"div"> & {
  /** Action à droite du titre (bouton ou lien). */
  action?: ReactNode;
};

export function CardHeader({ action, className, children, ...props }: CardHeaderProps) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex items-start justify-between gap-3", className)}
      {...props}
    >
      <div className="min-w-0 flex-1 space-y-0.5">{children}</div>
      {action ? (
        <div data-slot="card-action" className="shrink-0">
          {action}
        </div>
      ) : null}
    </div>
  );
}

export function CardTitle({ className, ...props }: ComponentProps<"h3">) {
  return <h3 className={cn("text-card-title", className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-meta text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("pt-3", className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex items-center pt-3", className)} {...props} />;
}
