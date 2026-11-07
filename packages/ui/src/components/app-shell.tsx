"use client";

import {
  type AnchorHTMLAttributes,
  type ComponentType,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Icon, type IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { useIsMobile } from "../lib/use-mobile.ts";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "./sheet.tsx";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip.tsx";

/** Composant de lien injecté par l'application (le lien du routeur) ; `a` par défaut. */
export type ShellLink = ComponentType<AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }>;

interface ShellState {
  /** Rail de 64 px : icônes seules. Toujours faux dans le tiroir. */
  collapsed: boolean;
  mobile: boolean;
  toggle: () => void;
}

export const ShellContext = createContext<ShellState>({
  collapsed: false,
  mobile: false,
  toggle: () => {},
});

/** État de la coquille pour le contenu de la barre (repli, mobile, bascule). */
export function useShell(): ShellState {
  return useContext(ShellContext);
}

const DEFAULT_KEY = "koklo.sidebar";

function readStored(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "collapsed";
  } catch {
    return false;
  }
}

function writeStored(key: string, collapsed: boolean): void {
  try {
    window.localStorage.setItem(key, collapsed ? "collapsed" : "expanded");
  } catch {
    // Stockage indisponible : l'état vaut pour la session seulement.
  }
}

function useCollapsed(storageKey: string) {
  const [collapsed, setCollapsed] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => setCollapsed(readStored(storageKey)), [storageKey]);
  const toggle = useCallback(() => {
    setCollapsed((current) => {
      writeStored(storageKey, !current);
      setAnnouncement(current ? "Barre étendue" : "Barre repliée");
      return !current;
    });
  }, [storageKey]);
  return { collapsed, announcement, toggle };
}

function useCollapseShortcut(enabled: boolean, toggle: () => void) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "b" || !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      toggle();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [enabled, toggle]);
}

export interface AppShellProps {
  /** Contenu de la barre (navigation, pied) ; il lit `useShell()` pour le rail replié. */
  sidebar: ReactNode;
  /** Nom affiché au centre de l'en-tête mobile. */
  mobileTitle: string;
  /** Boutons d'icône de 44 px à droite de l'en-tête mobile (thème, recherche). */
  mobileActions?: ReactNode;
  storageKey?: string;
  children: ReactNode;
}

function MobileShell({
  sidebar,
  mobileTitle,
  mobileActions,
  children,
}: Omit<AppShellProps, "storageKey">) {
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const value = useMemo<ShellState>(
    () => ({ collapsed: false, mobile: true, toggle: () => {} }),
    [],
  );
  return (
    <ShellContext.Provider value={value}>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background px-2 md:hidden">
        <button
          type="button"
          ref={menuButton}
          aria-label="Ouvrir le menu"
          onClick={() => setOpen(true)}
          className="flex size-11 items-center justify-center rounded-md text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon name="menu" />
        </button>
        <p className="min-w-0 flex-1 truncate text-center text-subsection-title">{mobileTitle}</p>
        <div className="flex items-center">{mobileActions}</div>
      </header>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            menuButton.current?.focus();
          }}
          className="w-72 max-w-72 gap-0 rounded-none bg-sidebar p-0 text-sidebar-foreground sm:max-w-72"
        >
          <SheetTitle className="sr-only">Navigation principale</SheetTitle>
          <SheetDescription className="sr-only">
            Pages du projet et de l'organisation
          </SheetDescription>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: délégation, la navigation vient des liens */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: les liens gèrent déjà le clavier */}
          <div
            className="flex min-h-0 flex-1 flex-col overflow-y-auto"
            onClick={(event) => {
              if ((event.target as Element).closest("a[href]")) setOpen(false);
            }}
          >
            {sidebar}
          </div>
        </SheetContent>
      </Sheet>
      <div className="min-w-0 flex-1">{children}</div>
    </ShellContext.Provider>
  );
}

function DesktopShell({
  sidebar,
  children,
  storageKey,
}: Pick<AppShellProps, "sidebar" | "children"> & { storageKey: string }) {
  const { collapsed, announcement, toggle } = useCollapsed(storageKey);
  useCollapseShortcut(true, toggle);
  const value = useMemo<ShellState>(
    () => ({ collapsed, mobile: false, toggle }),
    [collapsed, toggle],
  );
  return (
    <ShellContext.Provider value={value}>
      <aside
        data-slot="app-shell-sidebar"
        data-state={collapsed ? "collapsed" : "expanded"}
        className={cn(
          "sticky top-0 flex h-dvh shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar text-sidebar-foreground motion-safe:transition-[width] duration-150 max-md:hidden",
          collapsed ? "w-16" : "w-64",
        )}
      >
        {sidebar}
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
      {/* Région `aria-live` sans rôle `status` : l'écran garde un seul `role="status"` (règle 5, S-app-shell §5). */}
      <p aria-live="polite" aria-atomic="true" data-slot="shell-announcer" className="sr-only">
        {announcement}
      </p>
    </ShellContext.Provider>
  );
}

/**
 * Coquille de l'application (DESIGN.md v2.2 §5.4) : barre collante de 256 px (rail de 64 px, état en
 * `localStorage`, jamais en cookie) ou, sous 768 px, en-tête de 56 px et tiroir de 288 px.
 */
export function AppShell({ storageKey = DEFAULT_KEY, children, ...props }: AppShellProps) {
  const mobile = useIsMobile();
  return (
    <TooltipProvider>
      <div className="flex min-h-svh flex-col bg-background md:flex-row">
        {mobile ? (
          <MobileShell {...props}>{children}</MobileShell>
        ) : (
          <DesktopShell sidebar={props.sidebar} storageKey={storageKey}>
            {children}
          </DesktopShell>
        )}
      </div>
    </TooltipProvider>
  );
}

const ITEM_BASE =
  "flex w-full items-center gap-2.5 rounded-md border border-transparent px-2.5 text-sidebar-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors duration-150";
export const ITEM_ACTIVE = "border-border bg-background font-semibold";

export interface ShellNavItemProps {
  href: string;
  icon: IconName;
  label: string;
  active?: boolean;
  /** Pastille de compteur (ex. tickets du sprint actif) ; masquée dans le rail. */
  badge?: ReactNode;
  LinkComponent?: ShellLink;
}

/** Entrée de premier niveau : 36 px, icône de 20 px, icône pleine en `--primary` si active. */
export function ShellNavItem({
  href,
  icon,
  label,
  active = false,
  badge,
  LinkComponent: Link = "a" as unknown as ShellLink,
}: ShellNavItemProps) {
  const { collapsed, mobile } = useShell();
  const link = (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? label : undefined}
      className={cn(
        ITEM_BASE,
        // 44 px dans le tiroir (cible tactile), 36 px sur la barre.
        mobile ? "h-11 [@media(max-height:900px)]:h-9" : "h-9 [@media(max-height:900px)]:h-8",
        "text-body",
        collapsed && "justify-center px-0",
        active && ITEM_ACTIVE,
      )}
    >
      <Icon
        name={icon}
        fill={active}
        className={active ? "text-primary" : "text-muted-foreground"}
      />
      {collapsed ? null : <span className="min-w-0 flex-1 truncate">{label}</span>}
      {collapsed ? null : badge}
    </Link>
  );
  if (!collapsed) return link;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** « Replier la barre » (pied de la barre). Absent dans le tiroir. */
export function ShellCollapseButton() {
  const { collapsed, mobile, toggle } = useShell();
  if (mobile) return null;
  const label = collapsed ? "Étendre la barre" : "Replier la barre";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
      className={cn(
        ITEM_BASE,
        "h-8 [@media(max-height:900px)]:h-7 text-meta text-muted-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon name={collapsed ? "left_panel_open" : "left_panel_close"} size={18} />
      {collapsed ? null : <span>{label}</span>}
    </button>
  );
}
