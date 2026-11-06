import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { type ButtonHTMLAttributes, type Ref, useId } from "react";
import { cn } from "../lib/cn.ts";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium motion-safe:transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:border disabled:border-dashed disabled:border-border-strong disabled:bg-surface disabled:text-muted-foreground [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3 text-meta",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

type ButtonStyle = VariantProps<typeof buttonVariants>;

/**
 * `disabledReason` : raison visible d'un désactivé durable (prérequis manquant, droits), reliée par
 * `aria-describedby` (DESIGN.md v2 §5.2). Un désactivé transitoire (requête en vol) n'en a pas (B26).
 * Interdite avec `asChild` : le bouton doit rester l'élément décrit.
 */
type CommonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label" | "aria-labelledby"
> & {
  variant?: ButtonStyle["variant"];
  ref?: Ref<HTMLButtonElement>;
} & ({ asChild?: false; disabledReason?: string } | { asChild: true; disabledReason?: never });

/** Un bouton d'icône n'a pas de texte visible : le type impose un nom accessible. */
type IconSizedProps = CommonProps & { size: "icon" } & (
    | { "aria-label": string; "aria-labelledby"?: string }
    | { "aria-labelledby": string; "aria-label"?: string }
  );

type TextSizedProps = CommonProps & {
  size?: "default" | "sm";
  "aria-label"?: string;
  "aria-labelledby"?: string;
};

export type ButtonProps = IconSizedProps | TextSizedProps;

export function Button({
  className,
  variant,
  size,
  asChild = false,
  type,
  disabledReason,
  ...props
}: ButtonProps) {
  const reasonId = useId();
  const Comp = asChild ? Slot.Root : "button";
  const reason = props.disabled && disabledReason ? disabledReason : undefined;
  const button = (
    <Comp
      type={asChild ? undefined : (type ?? "button")}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
      aria-describedby={
        reason
          ? [props["aria-describedby"], reasonId].filter(Boolean).join(" ")
          : props["aria-describedby"]
      }
    />
  );
  if (!reason) return button;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {button}
      <span id={reasonId} className="text-meta text-muted-foreground">
        {reason}
      </span>
    </span>
  );
}
