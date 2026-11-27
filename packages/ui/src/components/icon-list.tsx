import { Icon, type IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";

export type IconListVariant = "shield" | "rule" | "block";

/** `shield` : parades ; `rule` : règles de propriété ; `block` : ce qui bloque une fusion. */
const VARIANTS: Record<IconListVariant, { icon: IconName; tone: string }> = {
  shield: { icon: "shield", tone: "text-primary" },
  rule: { icon: "rule", tone: "text-primary" },
  block: { icon: "block", tone: "text-status-revise-foreground" },
};

/** Liste à icône (DESIGN.md §5.28, maquette 15 l.144, 181, 199) : lignes de 13, icône de 18 décorative. */
export function IconList({
  variant,
  items,
  className,
}: {
  variant: IconListVariant;
  items: readonly string[];
  className?: string;
}) {
  const { icon, tone } = VARIANTS[variant];
  return (
    <ul data-slot="icon-list" className={cn("m-0 flex list-none flex-col gap-1.5 p-0", className)}>
      {items.map((item, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: liste lue, deux lignes peuvent se répéter
        <li key={`${index}-${item}`} className="flex gap-2.5 text-meta leading-normal">
          <Icon name={icon} size={18} className={cn("shrink-0", tone)} />
          <span className="min-w-0 flex-1 break-words">{item}</span>
        </li>
      ))}
    </ul>
  );
}
