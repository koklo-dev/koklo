"use client";

import { Command } from "cmdk";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { Skeleton } from "./skeleton.tsx";

export interface CommandPaletteItem {
  id: string;
  /** Type ou identifiant lisible en mono (« TK-12 », « F-003 », « Projet »). */
  kind: string;
  title: string;
  href: string;
}

export interface CommandPaletteGroup {
  key: string;
  label: string;
  items: CommandPaletteItem[];
}

export type CommandPaletteStatus = "idle" | "loading" | "ready" | "error";

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Appelé 200 ms après la dernière frappe, avec la saisie brute (le serveur filtre et classe). */
  onSearch: (query: string) => void;
  /** Appelé à chaque frappe, sans attente : pour filtrer localement (pages) pendant que le serveur est interrogé. */
  onQueryChange?: (query: string) => void;
  onSelect: (item: CommandPaletteItem) => void;
  onRetry: () => void;
  status: CommandPaletteStatus;
  groups: CommandPaletteGroup[];
  /** Total côté serveur quand il dépasse les résultats affichés. */
  total?: number;
}

const DEBOUNCE_MS = 200;
const SKELETON_ROWS = 4;
const HINT = "La recherche porte sur tout le projet, pas seulement sur ce qui est affiché.";

function useOpenShortcut(onOpenChange: (open: boolean) => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      onOpenChange(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onOpenChange]);
}

/**
 * Rend le focus à l'élément qui l'avait avant l'ouverture. Radix ne le fait pas ici : sans déclencheur, il
 * remet le focus à rien (la page se retrouve sur `body`, et la personne perd sa place dans un champ).
 */
function useRestoreFocus(open: boolean) {
  const origin = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (open) {
      origin.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      return;
    }
    const target = origin.current;
    origin.current = null;
    if (!target) return;
    // Après le démontage du dialogue : tant qu'il est monté, son piège de focus reprend le focus.
    const timer = setTimeout(() => target.isConnected && target.focus(), 0);
    return () => clearTimeout(timer);
  }, [open]);
}

/**
 * Saisie locale (`onQueryChange` tout de suite), requête serveur anti-rebondie (`onSearch`) ; la saisie est remise à
 * zéro à la fermeture.
 */
function useDebouncedQuery(
  open: boolean,
  onSearch: (query: string) => void,
  onQueryChange: ((query: string) => void) | undefined,
) {
  const [query, setQueryState] = useState("");
  const latest = useRef(onSearch);
  latest.current = onSearch;
  const change = useRef(onQueryChange);
  change.current = onQueryChange;
  const setQuery = (next: string) => {
    setQueryState(next);
    change.current?.(next);
  };
  useEffect(() => {
    if (!open) {
      setQueryState("");
      change.current?.("");
    }
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => latest.current(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [open, query]);
  return [query, setQuery] as const;
}

const optionValue = (group: CommandPaletteGroup, item: CommandPaletteItem) =>
  `${group.key}:${item.id}`;

/**
 * Option active : cmdk ne la recalcule pas sans filtrage local (`shouldFilter` faux) et garderait l'ancienne
 * sélection ; Entrée ouvrirait alors une option qui a disparu de la liste. La première option est rendue active
 * à chaque changement de résultats.
 */
function useActiveOption(groups: CommandPaletteGroup[]) {
  const values = groups.flatMap((group) => group.items.map((item) => optionValue(group, item)));
  const signature = values.join("\n");
  const [active, setActive] = useState("");
  // biome-ignore lint/correctness/useExhaustiveDependencies: `signature` résume `values`
  useEffect(() => setActive(values[0] ?? ""), [signature]);
  return [active, setActive] as const;
}

function statusText(
  status: CommandPaletteStatus,
  shown: number,
  total: number | undefined,
  query: string,
): string {
  if (status !== "ready") return "";
  if (shown === 0) return query ? "Aucun résultat" : "";
  if (total !== undefined && total > shown) return `${total} résultats · ${shown} affichés`;
  return `${shown} résultat${shown > 1 ? "s" : ""}`;
}

function ResultRow({ item }: { item: CommandPaletteItem }) {
  return (
    <>
      <span className="shrink-0 font-mono text-code text-muted-foreground">{item.kind}</span>
      <span className="min-w-0 flex-1 truncate">{item.title}</span>
    </>
  );
}

const GROUP_CLASS =
  "px-2 py-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-group-label [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-muted-foreground";

/** Messages hors de la liste : un `listbox` ne contient que des options ou des groupes d'options (aria-required-children). */
function Messages({
  status,
  query,
  shown,
  onRetry,
}: Pick<CommandPaletteProps, "status" | "onRetry"> & { query: string; shown: number }) {
  if (status === "error") {
    return (
      <div role="alert" className="flex flex-col items-start gap-2 p-4 text-meta">
        <p>La recherche a échoué. Réessayez.</p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border px-3 py-1.5 text-meta font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Réessayer
        </button>
      </div>
    );
  }
  if (status === "ready" && shown === 0 && query) {
    return (
      <div className="flex flex-col gap-1 p-4 text-center">
        <p className="text-subsection-title">{`Aucun résultat pour « ${query} »`}</p>
        <p className="text-meta text-muted-foreground">{HINT}</p>
      </div>
    );
  }
  // L'invite ne vaut que champ vide : dès qu'on a tapé, les pages filtrées parlent d'elles-mêmes.
  if (status === "idle" && query === "") {
    return <p className="px-4 py-3 text-meta text-muted-foreground">Tapez pour rechercher.</p>;
  }
  return null;
}

function Results({
  status,
  groups,
  onSelect,
}: Pick<CommandPaletteProps, "status" | "groups" | "onSelect">) {
  if (status === "loading") {
    return (
      <Command.Loading label="Recherche en cours">
        <div className="flex flex-col gap-1 p-2">
          {Array.from({ length: SKELETON_ROWS }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: squelettes identiques
            <Skeleton key={i} className="h-11" />
          ))}
        </div>
      </Command.Loading>
    );
  }
  return groups.map((group) => (
    <Command.Group key={group.key} heading={group.label} className={GROUP_CLASS}>
      {group.items.map((item) => (
        <Command.Item
          key={optionValue(group, item)}
          value={optionValue(group, item)}
          onSelect={() => onSelect(item)}
          className="flex h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-body data-[selected=true]:bg-secondary data-[selected=true]:text-secondary-foreground"
        >
          <ResultRow item={item} />
        </Command.Item>
      ))}
    </Command.Group>
  ));
}

/**
 * Palette ⌘K (DESIGN.md §5.4) : cmdk sans filtrage local, la recherche est celle du serveur (B3). Le
 * raccourci Ctrl K / ⌘ K l'ouvre depuis n'importe où, y compris dans un champ.
 */
export function CommandPalette({
  open,
  onOpenChange,
  onSearch,
  onQueryChange,
  onSelect,
  onRetry,
  status,
  groups,
  total,
}: CommandPaletteProps) {
  useOpenShortcut(onOpenChange);
  useRestoreFocus(open);
  const [query, setQuery] = useDebouncedQuery(open, onSearch, onQueryChange);
  const shown = groups.reduce((sum, group) => sum + group.items.length, 0);
  const [active, setActive] = useActiveOption(groups);
  const select = (item: CommandPaletteItem) => {
    onSelect(item);
    onOpenChange(false);
  };
  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Recherche"
      shouldFilter={false}
      value={active}
      onValueChange={setActive}
      loop
      contentClassName={cn(
        "fixed left-4 right-4 top-4 z-50 max-h-[calc(100dvh-2rem)] overflow-hidden rounded-xl border border-border bg-raised shadow-floating",
        "sm:left-1/2 sm:right-auto sm:top-[15%] sm:w-full sm:max-w-[560px] sm:-translate-x-1/2",
      )}
      overlayClassName="fixed inset-0 z-50 bg-foreground/40 motion-safe:animate-overlay-in"
    >
      <div className="flex h-12 items-center gap-2 border-b px-4">
        <Icon name="search" className="text-muted-foreground" />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Rechercher un projet, une fonctionnalité, un ticket"
          className="h-full min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-muted-foreground"
        />
      </div>
      <Messages status={status} query={query} shown={shown} onRetry={onRetry} />
      {/* Liste masquée sans option ni attente : un `listbox` vide fait échouer aria-required-children, et le champ
          y reste relié (aria-controls) par son identifiant. */}
      <Command.List
        hidden={shown === 0 && status !== "loading"}
        aria-busy={status === "loading"}
        className="max-h-[min(420px,60dvh)] overflow-y-auto"
      >
        <Results status={status} groups={status === "error" ? [] : groups} onSelect={select} />
      </Command.List>
      <p role={status === "error" ? undefined : "status"} className="sr-only">
        {statusText(status, shown, total, query)}
      </p>
      {status === "ready" && total !== undefined && total > shown ? (
        <p aria-hidden="true" className="border-t px-4 py-2 text-caption text-muted-foreground">
          {`${total} résultats · ${shown} affichés`}
        </p>
      ) : null}
      <p className="hidden border-t px-4 py-2 text-caption text-muted-foreground sm:block">
        ↑ ↓ pour naviguer · ↵ pour ouvrir · Échap pour fermer
      </p>
    </Command.Dialog>
  );
}
