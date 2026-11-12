"use client";

import { SearchField } from "@koklo/ui";
import type { useSearchBox } from "../lib/use-features-list.ts";

/** Recherche sur toutes les fonctionnalités du projet, pas seulement celles affichées (`/` y met le focus). */
export function FeaturesSearch({ search }: { search: ReturnType<typeof useSearchBox> }) {
  return (
    <SearchField
      ref={search.inputRef}
      label="Rechercher une fonctionnalité"
      placeholder="Rechercher par titre ou F-nnn"
      name="q"
      autoComplete="off"
      maxLength={200}
      className="min-w-0 flex-1 basis-56 md:max-w-[300px] max-md:[&_input]:h-11"
      value={search.text}
      onChange={(event) => search.onChange(event.target.value)}
    />
  );
}
