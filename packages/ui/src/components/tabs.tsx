"use client";

import { Tabs as TabsPrimitive } from "radix-ui";
import { type ComponentProps, createContext, type ReactNode, useContext } from "react";
import { Icon, type IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import type { ShellLink } from "./app-shell.tsx";
import { CountBadge } from "./count-badge.tsx";

type TabsVariant = "segmented" | "underline";
type TabsSize = "md" | "sm";

const TabsStyle = createContext<{ variant: TabsVariant }>({ variant: "segmented" });

const UNDERLINE_TAB =
  "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const UNDERLINE_ACTIVE = "border-primary font-semibold text-foreground";
const UNDERLINE_SIZE: Record<TabsSize, string> = { md: "text-body", sm: "text-meta" };

export type TabsProps = ComponentProps<typeof TabsPrimitive.Root> & {
  /** `segmented` (défaut) ou `underline` (DESIGN.md §5.6). */
  variant?: TabsVariant;
  /** Taille du texte de `underline` : `sm` (13 px) dans un tiroir. */
  size?: TabsSize;
};

const SizeContext = createContext<TabsSize>("md");

export function Tabs({ variant = "segmented", size = "md", ...props }: TabsProps) {
  return (
    <TabsStyle.Provider value={{ variant }}>
      <SizeContext.Provider value={size}>
        <TabsPrimitive.Root {...props} />
      </SizeContext.Provider>
    </TabsStyle.Provider>
  );
}

export interface TabsNavItem {
  label: string;
  href: string;
  active?: boolean;
  /** Compteur en pastille (nombre, « … » en génération, « 3 à relire ») ; absent quand il n'est pas connu. */
  count?: number | string;
  /** `primary` : pastille pleine pour « N à relire » (maquette 10 l.670-683) ; `soft` par défaut. */
  countTone?: "soft" | "primary";
  icon?: IconName;
}

/** Onglets soulignés en liens (mode lien) : `nav` nommée, l'onglet actif porte `aria-current="page"`. */
export function TabsNav({
  tabs,
  label,
  size = "md",
  className,
  LinkComponent: Link = "a" as unknown as ShellLink,
}: {
  tabs: TabsNavItem[];
  label: string;
  size?: TabsSize;
  className?: string;
  LinkComponent?: ShellLink;
}) {
  return (
    <nav aria-label={label} className={className}>
      <ul className="flex gap-5 overflow-x-auto">
        {tabs.map((tab) => (
          <li key={tab.label} className="shrink-0">
            <Link
              href={tab.href}
              aria-current={tab.active ? "page" : undefined}
              className={cn(
                UNDERLINE_TAB,
                UNDERLINE_SIZE[size],
                tab.active ? UNDERLINE_ACTIVE : "border-transparent",
              )}
            >
              {tab.icon ? <Icon name={tab.icon} size={16} /> : null}
              {tab.label}
              {tab.count === undefined ? null : (
                <CountBadge tone={tab.countTone ?? "soft"}>{tab.count}</CountBadge>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  const { variant } = useContext(TabsStyle);
  return (
    <TabsPrimitive.List
      className={cn(
        variant === "underline"
          ? "flex gap-5 overflow-x-auto"
          : "inline-flex h-9 items-center rounded-md bg-muted p-1 text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

const SEGMENTED_TRIGGER =
  "inline-flex items-center justify-center whitespace-nowrap rounded-sm border border-transparent px-3 py-1 text-sm font-medium motion-safe:transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-border data-[state=active]:bg-background data-[state=active]:text-foreground";
const UNDERLINE_TRIGGER =
  "data-[state=active]:border-primary data-[state=active]:font-semibold data-[state=active]:text-foreground disabled:pointer-events-none disabled:opacity-50";

export function TabsTrigger({
  className,
  icon,
  count,
  children,
  ...props
}: ComponentProps<typeof TabsPrimitive.Trigger> & { icon?: IconName; count?: number }) {
  const { variant } = useContext(TabsStyle);
  const size = useContext(SizeContext);
  const underline = variant === "underline";
  const extras: ReactNode = underline ? (
    <>
      {icon ? <Icon name={icon} size={16} /> : null}
      {children}
      {count === undefined ? null : <CountBadge>{count}</CountBadge>}
    </>
  ) : (
    children
  );
  return (
    <TabsPrimitive.Trigger
      className={cn(
        underline ? [UNDERLINE_TAB, UNDERLINE_SIZE[size], UNDERLINE_TRIGGER] : SEGMENTED_TRIGGER,
        className,
      )}
      {...props}
    >
      {extras}
    </TabsPrimitive.Trigger>
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn(
        "mt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
      {...props}
    />
  );
}
