"use client";

import type { SpecRefsSearchOutput } from "@koklo/contract";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { orpc } from "./orpc.ts";

/** Délai d'anti-rebond de la recherche de liens (fiche TK-101, S-spec-item-sheet). */
export const REFS_DEBOUNCE_MS = 200;

/** Genres proposés pour un lien de fonctionnalité : les `F-` et `P-` n'y sont pas admis (B329 e). */
const FEATURE_LINK_KINDS = ["screen", "rule", "table", "endpoint"] as const;
type Kind = "feature" | "rule" | "flow" | "table" | "endpoint" | "screen";

/**
 * Autocomplétion des liens : `spec.refs.search` une fois la frappe posée (200 ms), jamais sur une saisie vide.
 * Les propositions déjà choisies sont écartées par la saisie à puces.
 */
export function useRefsSearch(projectId: string, kinds: readonly Kind[] = FEATURE_LINK_KINDS) {
  const [query, setQuery] = useState("");
  const [settled, setSettled] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSettled(query.trim()), REFS_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);
  const search = useQuery({
    ...orpc.spec.refs.search.queryOptions({ input: { projectId, kinds: [...kinds], q: settled } }),
    enabled: settled !== "",
  });
  const items: SpecRefsSearchOutput["items"] = settled === "" ? [] : (search.data?.items ?? []);
  return {
    onQueryChange: setQuery,
    suggestions: items.map((item) => ({ id: item.specId, title: item.title })),
  };
}
