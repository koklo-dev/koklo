import { cva } from "class-variance-authority";
import type { ComponentProps, MouseEventHandler } from "react";
import { Icon, type IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { PILL_TONE } from "./status-pill.ts";

export type PillSize = "xs" | "sm" | "md";
export type PillTone = keyof typeof PILL_TONE;

export const pillVariants = cva(
  "inline-flex items-center whitespace-nowrap rounded-full motion-safe:transition-colors duration-150",
  {
    variants: {
      size: {
        xs: "h-[18px] px-1.5 text-count",
        sm: "h-[22px] gap-1 px-2 text-count",
        md: "h-6 px-2.5 text-caption",
      },
      tone: PILL_TONE,
    },
    defaultVariants: { size: "md", tone: "neutral" },
  },
);

const ICON_SIZE = { xs: 14, sm: 14, md: 16 } as const;

type PillBase = {
  size?: PillSize;
  tone?: PillTone;
  /** Icône pleine, 14 en xs et sm, 16 en md. */
  icon?: IconName;
  /** Icône pleine (défaut) ; `false` : au contour (statuts neutres, maquette 07). */
  iconFill?: boolean;
};

export type PillProps = PillBase &
  (
    | ({ interactive?: false } & ComponentProps<"span">)
    | ({ interactive: true; onClick?: MouseEventHandler<HTMLButtonElement> } & Omit<
        ComponentProps<"button">,
        "onClick"
      >)
  );

/** Pastille (DESIGN.md §5.5) ; `interactive` en fait un bouton à flèche `keyboard_arrow_down`. */
export function Pill({
  size = "md",
  tone = "neutral",
  icon,
  iconFill = true,
  interactive,
  className,
  children,
  ...rest
}: PillProps) {
  const shared = {
    "data-slot": "pill",
    "data-size": size,
    "data-tone": tone,
    className: cn(
      pillVariants({ size, tone }),
      icon && size === "md" && "gap-1.5 pl-1.5",
      interactive &&
        "gap-1 pr-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      className,
    ),
  };
  const content = icon ? <Icon name={icon} size={ICON_SIZE[size]} fill={iconFill} /> : null;
  if (interactive) {
    return (
      <button type="button" {...shared} {...(rest as ComponentProps<"button">)}>
        {content}
        {children}
        <Icon name="keyboard_arrow_down" size={16} />
      </button>
    );
  }
  return (
    <span {...shared} {...(rest as ComponentProps<"span">)}>
      {content}
      {children}
    </span>
  );
}
