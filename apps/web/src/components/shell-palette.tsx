"use client";

import type { SearchResult } from "@koklo/contract";
import {
  CommandPalette,
  type CommandPaletteGroup,
  type CommandPaletteItem,
  type CommandPaletteStatus,
} from "@koklo/ui";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { orpc } from "../lib/orpc.ts";
import {
  featuresPath,
  ideaPath,
  PROJECTS_PATH,
  type SpecSlug,
  settingsPath,
  specPath,
  ticketsPath,
} from "../lib/shell-routes.ts";

interface PageEntry {
  title: string;
  href: string;
}

/** Pages de la coquille que la palette filtre localement. Les livrables verrouillés n'y figurent jamais (D4). */
function pagesOf(
  projectId: string | null,
  available: readonly SpecSlug[],
  canSettings: boolean,
): PageEntry[] {
  const spec: Record<SpecSlug, string> = {
    functional: "Spec · Fonctionnel",
    data: "Spec · Données",
    architecture: "Spec · Architecture",
    technical: "Spec · Technique",
    security: "Spec · Sécurité",
    design: "Spec · Design",
    quality: "Spec · Qualité",
  };
  return [
    ...(projectId
      ? [
          { title: "Idée", href: ideaPath(projectId) },
          ...available.map((slug) => ({ title: spec[slug], href: specPath(projectId, slug) })),
          { title: "Tickets", href: ticketsPath(projectId) },
        ]
      : []),
    { title: "Tous les projets", href: PROJECTS_PATH },
    ...(canSettings ? [{ title: "Réglages", href: settingsPath("members") }] : []),
  ];
}

const matches = (title: string, query: string): boolean =>
  title.toLowerCase().includes(query.trim().toLowerCase());

function resultItem(result: SearchResult): { group: string; item: CommandPaletteItem } {
  switch (result.kind) {
    case "project":
      return {
        group: "projects",
        item: { id: result.id, kind: "Projet", title: result.name, href: `/projects/${result.id}` },
      };
    case "feature":
      return {
        group: "features",
        item: {
          id: `${result.projectId}:${result.specId}`,
          kind: result.specId,
          title: result.title,
          href: featuresPath(result.projectId, `sel=${result.specId}`),
        },
      };
    case "ticket":
      return {
        group: "tickets",
        item: {
          id: `${result.projectId}:${result.key}`,
          kind: result.key,
          title: result.title,
          href: ticketsPath(result.projectId),
        },
      };
  }
}

const LABELS: Array<[string, string]> = [
  ["pages", "Pages"],
  ["projects", "Projets"],
  ["features", "Fonctionnalités"],
  ["tickets", "Tickets"],
];

function groupsOf(pages: PageEntry[], results: readonly SearchResult[]): CommandPaletteGroup[] {
  const byGroup = new Map<string, CommandPaletteItem[]>([
    ["pages", pages.map((page) => ({ id: page.href, kind: "Page", ...page }))],
  ]);
  for (const result of results) {
    const { group, item } = resultItem(result);
    byGroup.set(group, [...(byGroup.get(group) ?? []), item]);
  }
  return LABELS.flatMap(([key, label]) => {
    const items = byGroup.get(key) ?? [];
    return items.length > 0 ? [{ key, label, items }] : [];
  });
}

function statusOf(query: string, search: { isFetching: boolean; isError: boolean }) {
  if (query.trim() === "") return "idle";
  if (search.isError) return "error";
  return search.isFetching ? "loading" : "ready";
}

/**
 * Palette ⌘K branchée sur la recherche du serveur (`search.query`, B3) : projets, puis fonctionnalités et tickets
 * du projet courant, 20 résultats au plus. Les pages de la coquille sont filtrées localement.
 */
export function ShellPalette({
  open,
  onOpenChange,
  projectId,
  available,
  canSettings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
  available: readonly SpecSlug[];
  canSettings: boolean;
}) {
  const router = useRouter();
  // `typed` suit la frappe (pages filtrées tout de suite) ; `query` la suit 200 ms plus tard (requête serveur).
  const [query, setQuery] = useState("");
  const [typed, setTyped] = useState("");
  const q = query.trim();
  const search = useQuery({
    ...orpc.search.query.queryOptions({ input: { q, ...(projectId ? { projectId } : {}) } }),
    enabled: open && q !== "",
  });
  const pages = useMemo(
    () => pagesOf(projectId, available, canSettings).filter((page) => matches(page.title, typed)),
    [projectId, available, canSettings, typed],
  );
  const status: CommandPaletteStatus = statusOf(q, search);
  const groups = groupsOf(pages, status === "ready" ? (search.data?.items ?? []) : []);
  return (
    <CommandPalette
      open={open}
      onOpenChange={onOpenChange}
      onSearch={setQuery}
      onQueryChange={setTyped}
      onSelect={(item: CommandPaletteItem) => router.push(item.href)}
      onRetry={() => void search.refetch()}
      status={status}
      groups={groups}
      {...(search.data && status === "ready" ? { total: search.data.total + pages.length } : {})}
    />
  );
}
