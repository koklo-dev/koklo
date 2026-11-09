import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { type ButtonHTMLAttributes, type MouseEvent, type Ref, useId } from "react";
import { Icon, type IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { Kbd } from "./kbd.tsx";
import { Spinner } from "./spinner.tsx";

const baseVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium motion-safe:transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:border disabled:border-dashed disabled:border-border-strong disabled:bg-surface disabled:text-muted-foreground [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        dashed:
          "border border-dashed border-border-strong bg-transparent hover:bg-accent hover:text-accent-foreground",
        inherit: "border border-current bg-transparent font-semibold hover:bg-current/10",
        text: "bg-transparent text-meta text-foreground underline underline-offset-4 hover:bg-current/10",
        link: "bg-transparent px-2.5 font-semibold text-inherit underline underline-offset-4 hover:bg-current/10",
      },
      size: {
        xs: "h-7 gap-1.5 px-2.5 text-caption",
        sm: "h-8 gap-1.5 px-3 text-meta",
        compact: "h-[30px] gap-1.5 px-2.5 text-meta",
        default: "h-9 px-3.5",
        lg: "h-10 px-4",
        icon: "size-9",
      },
    },
    compoundVariants: [
      { variant: "link", class: "h-7 px-2.5 text-meta" },
      { variant: "text", class: "h-[26px] px-2 text-meta" },
      { variant: "ghost", size: "default", class: "px-3" },
    ],
    defaultVariants: { variant: "default", size: "default" },
  },
);

/** `cn` résout les conflits : la hauteur 28 du lien l'emporte sur celle de la taille. */
export const buttonVariants = (options?: VariantProps<typeof baseVariants>): string =>
  cn(baseVariants(options));

type ButtonStyle = VariantProps<typeof baseVariants>;

/** Marge gauche réduite quand une icône précède le libellé (DESIGN.md §5.2). */
const ICON_PADDING: Partial<Record<NonNullable<ButtonStyle["size"]>, string>> = {
  sm: "pl-2.5",
  default: "pl-3",
  lg: "pl-3",
};
const PRESSED_HALO = "shadow-[0_0_0_3px_var(--secondary)]";

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
  /** Icône de tête (16 en xs et sm, 20 sinon). Ignorée avec `asChild`. */
  icon?: IconName;
  /** Raccourci affiché en suffixe dans un `Kbd`. Ignoré avec `asChild`. */
  shortcut?: string;
  /** Requête en vol : `aria-busy`, spinner, clic ignoré ; le bouton reste focalisable. */
  loading?: boolean;
  /** Bouton à bascule : `aria-pressed` et halo `--secondary`. */
  pressed?: boolean;
  fullWidth?: boolean;
} & ({ asChild?: false; disabledReason?: string } | { asChild: true; disabledReason?: never });

/** Un bouton d'icône n'a pas de texte visible : le type impose un nom accessible. */
type IconSizedProps = CommonProps & { size: "icon" } & (
    | { "aria-label": string; "aria-labelledby"?: string }
    | { "aria-labelledby": string; "aria-label"?: string }
  );

type TextSizedProps = CommonProps & {
  size?: "xs" | "sm" | "compact" | "default" | "lg";
  "aria-label"?: string;
  "aria-labelledby"?: string;
};

export type ButtonProps = IconSizedProps | TextSizedProps;

type StyleProps = Pick<ButtonStyle, "variant" | "size"> &
  Pick<CommonProps, "icon" | "loading" | "pressed" | "fullWidth">;

function buttonClassName({ variant, size, icon, loading, pressed, fullWidth }: StyleProps) {
  return cn(
    buttonVariants({ variant, size }),
    icon && ICON_PADDING[size ?? "default"],
    loading && "opacity-[.82]",
    pressed && PRESSED_HALO,
    fullWidth && "w-full",
  );
}

type ContentProps = Pick<CommonProps, "icon" | "shortcut" | "loading" | "children"> & {
  compact: boolean;
};

/** Spinner (ou icône de tête), libellé puis raccourci. */
function ButtonContent({ icon, shortcut, loading, compact, children }: ContentProps) {
  const size = compact ? 16 : 20;
  return (
    <>
      {loading ? <Spinner size={size} tone="current" /> : null}
      {icon && !loading ? <Icon name={icon} size={size} /> : null}
      {children}
      {shortcut ? <Kbd>{shortcut}</Kbd> : null}
    </>
  );
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  type,
  disabledReason,
  icon,
  shortcut,
  loading = false,
  pressed,
  fullWidth = false,
  children,
  onClick,
  ...props
}: ButtonProps) {
  const reasonId = useId();
  const Comp = asChild ? Slot.Root : "button";
  const reason = props.disabled && disabledReason ? disabledReason : undefined;
  const describedBy = [props["aria-describedby"], reason && reasonId].filter(Boolean).join(" ");
  const button = (
    <Comp
      type={asChild ? undefined : (type ?? "button")}
      className={cn(
        buttonClassName({ variant, size, icon, loading, pressed, fullWidth }),
        className,
      )}
      aria-busy={loading || undefined}
      aria-pressed={pressed}
      {...props}
      onClick={(event: MouseEvent<HTMLButtonElement>) =>
        loading ? event.preventDefault() : onClick?.(event)
      }
      aria-describedby={describedBy || undefined}
    >
      {asChild ? (
        children
      ) : (
        <ButtonContent
          icon={icon}
          shortcut={shortcut}
          loading={loading}
          compact={size === "xs" || size === "sm"}
        >
          {children}
        </ButtonContent>
      )}
    </Comp>
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
