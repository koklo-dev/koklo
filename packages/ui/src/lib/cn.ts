import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Rôles de l'échelle typographique (DESIGN.md v2 §3, `index.css`). Déclarés comme tailles de texte pour que
 * tailwind-merge ne les prenne pas pour des couleurs : sans cela, `text-meta text-muted-foreground` perdrait
 * `text-meta`.
 */
const TEXT_ROLES = [
  "page-title",
  "section-title",
  "subsection-title",
  "body",
  "meta",
  "group-label",
  "caption",
  "code",
  "card-title",
  "dialog-title",
  "stat",
  "count",
  "code-sm",
  "settings-title",
];

const twMerge = extendTailwindMerge({ extend: { theme: { text: TEXT_ROLES } } });

/** Compose des classes conditionnelles (clsx) puis résout les conflits Tailwind (tailwind-merge). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
