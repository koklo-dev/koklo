import { useId } from "react";
import { Icon, type IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import type { ShellLink } from "./app-shell.tsx";
import { CountBadge } from "./count-badge.tsx";

export interface NavItemProps {
  href: string;
  icon: IconName;
  label: string;
  /** Page courante : `aria-current="page"`, fond `--secondary`, icône pleine `--primary`. */
  current?: boolean;
  count?: number;
  LinkComponent?: ShellLink;
}

/** Entrée de navigation secondaire : 36 px, 14 px, icône de 18 ; 44 px sous `md`. */
export function NavItem({
  href,
  icon,
  label,
  current = false,
  count,
  LinkComponent: Link = "a" as unknown as ShellLink,
}: NavItemProps) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-body text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors duration-150",
        "max-md:min-h-11 max-md:shrink-0 max-md:whitespace-nowrap",
        current && "bg-secondary font-semibold",
      )}
    >
      <Icon
        name={icon}
        size={18}
        fill={current}
        className={current ? "text-primary" : "text-muted-foreground"}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count === undefined ? null : <CountBadge tone="outline">{count}</CountBadge>}
    </Link>
  );
}

export interface SecondaryNavGroup {
  label: string;
  items: readonly Omit<NavItemProps, "LinkComponent">[];
}

export interface SecondaryNavProps {
  /** Nom de la région de navigation. */
  label: string;
  groups: readonly SecondaryNavGroup[];
  LinkComponent?: ShellLink;
  className?: string;
}

function NavGroup({
  group,
  LinkComponent,
}: {
  group: SecondaryNavGroup;
  LinkComponent?: ShellLink;
}) {
  const id = useId();
  return (
    // biome-ignore lint/a11y/useSemanticElements: un fieldset impose sa mise en page ; le groupe n'est pas un formulaire
    <div
      role="group"
      aria-labelledby={id}
      className="flex flex-col gap-0.5 max-md:flex-row max-md:gap-1"
    >
      <span
        id={id}
        className="px-2 pt-3 pb-1 text-group-label text-muted-foreground uppercase max-md:sr-only"
      >
        {group.label}
      </span>
      {group.items.map((item) => (
        <NavItem key={item.label} {...item} LinkComponent={LinkComponent} />
      ))}
    </div>
  );
}

/** Navigation secondaire (Réglages) : 240 dès `md`, rangée défilante en dessous. */
export function SecondaryNav({ label, groups, LinkComponent, className }: SecondaryNavProps) {
  return (
    <nav
      aria-label={label}
      className={cn(
        "relative flex flex-col gap-0.5 md:w-60 md:shrink-0 md:border-r md:px-3 md:py-4",
        "max-md:flex-row max-md:gap-1 max-md:overflow-x-auto max-md:border-b max-md:px-4 max-md:py-1",
        className,
      )}
    >
      {groups.map((group) => (
        <NavGroup key={group.label} group={group} LinkComponent={LinkComponent} />
      ))}
    </nav>
  );
}
