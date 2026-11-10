"use client";

import type { ProjectCardsOutput } from "@koklo/contract";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  FilterChip,
  Icon,
  SearchField,
} from "@koklo/ui";
import { useEffect, useState } from "react";
import type { ProjectsPhase, ProjectsSort, ProjectsUrl } from "../lib/projects-url.ts";

const SEARCH_DELAY_MS = 200;

const FILTERS: ReadonlyArray<{ key: "all" | ProjectsPhase; label: string }> = [
  { key: "all", label: "Tous" },
  { key: "idea", label: "Idée" },
  { key: "framing", label: "Cadrage" },
  { key: "iterations", label: "Itérations" },
];

const SORTS: ReadonlyArray<{ key: ProjectsSort; label: string }> = [
  { key: "activity", label: "Activité récente" },
  { key: "name", label: "Nom" },
  { key: "attention", label: "Action attendue d'abord" },
];

/** Recherche saisie, envoyée au serveur 200 ms après la dernière frappe ; l'adresse reste la source de vérité. */
function useSearchBox(q: string, setQuery: (q: string) => void) {
  const [text, setText] = useState(q);
  // L'adresse change ailleurs (« Effacer les filtres », retour arrière) : la saisie la suit.
  useEffect(() => setText(q), [q]);
  useEffect(() => {
    if (text.trim() === q.trim()) return;
    const timer = setTimeout(() => setQuery(text), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, q, setQuery]);
  return { text, setText, clear: () => setQuery("") };
}

function SortMenu({ sort, onSort }: { sort: ProjectsSort; onSort: (sort: ProjectsSort) => void }) {
  const current = SORTS.find((item) => item.key === sort) ?? SORTS[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-meta text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring max-md:min-h-11"
        >
          {`Trié par : ${current?.label.toLowerCase()}`}
          <Icon name="unfold_more" size={16} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuRadioGroup
          value={sort}
          onValueChange={(value) => onSort(value as ProjectsSort)}
        >
          {SORTS.map((item) => (
            <DropdownMenuRadioItem key={item.key} value={item.key}>
              {item.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Barre d'outils de la liste (maquette 08 l.69-82) : recherche, filtres de phase avec les compteurs du serveur,
 * menu de tri. Les compteurs viennent de `facets` ; sans réponse encore, ils sont absents.
 */
export function ProjectsToolbar({
  url,
  facets,
  onQuery,
  onPhase,
  onSort,
}: {
  url: ProjectsUrl;
  facets: ProjectCardsOutput["facets"] | undefined;
  onQuery: (q: string) => void;
  onPhase: (phase: ProjectsPhase | null) => void;
  onSort: (sort: ProjectsSort) => void;
}) {
  const box = useSearchBox(url.q, onQuery);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <SearchField
        label="Rechercher un projet"
        placeholder="Rechercher un projet ou un client"
        value={box.text}
        onChange={(event) => box.setText(event.target.value)}
        onClear={box.clear}
        maxLength={200}
        className="max-w-80 flex-[1_1_240px] max-md:max-w-none"
      />
      {/* biome-ignore lint/a11y/useSemanticElements: un fieldset impose sa mise en page ; le groupe de filtres n'est pas un formulaire */}
      <div role="group" aria-label="Filtrer par phase" className="inline-flex flex-wrap gap-1">
        {FILTERS.map(({ key, label }) => (
          <FilterChip
            key={key}
            pressed={(url.phase ?? "all") === key}
            onClick={() => onPhase(key === "all" ? null : key)}
            className="h-8 text-meta font-medium max-md:h-11"
          >
            {label}
            {facets ? (
              <span className="text-caption opacity-75 [font-weight:inherit]">{facets[key]}</span>
            ) : null}
          </FilterChip>
        ))}
      </div>
      <span className="flex-1" />
      <SortMenu sort={url.sort} onSort={onSort} />
    </div>
  );
}
