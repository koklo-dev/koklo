"use client";

import { Field, Input, Label } from "@koklo/ui";
import { useId } from "react";
import type { useSearchBox } from "../lib/use-features-list.ts";

/** Recherche sur toutes les fonctionnalités du projet, pas seulement celles affichées (`/` y met le focus). */
export function FeaturesSearch({ search }: { search: ReturnType<typeof useSearchBox> }) {
  const id = useId();
  return (
    <Field className="md:max-w-md">
      <Label htmlFor={id}>Rechercher une fonctionnalité</Label>
      <Input
        id={id}
        ref={search.inputRef}
        type="search"
        name="q"
        autoComplete="off"
        maxLength={200}
        className="h-11 md:h-9"
        value={search.text}
        onChange={(event) => search.onChange(event.target.value)}
      />
    </Field>
  );
}
