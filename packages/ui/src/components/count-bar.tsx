"use client";

import { type HTMLAttributes, type ReactNode, useEffect, useRef, useState } from "react";
import { Icon } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { type CountNoun, formatCount, loadedWord, nounFor } from "../lib/format-count.ts";

export interface CountBarProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** Total réel, calculé par le serveur. */
  total: number;
  /** Nombre d'éléments chargés dans la liste. */
  loaded: number;
  noun: CountNoun;
  /** Compteur de filtre prêt à lire : « 31 à valider ». */
  filterLabel?: string;
  /** Tri courant, à droite : « identifiant ». */
  sort?: ReactNode;
  /** Recherche saisie : « 0 résultat pour « x » » remplace le nom de l'objet. */
  query?: string;
  /** Liste entièrement chargée : « · toutes chargées » après le total (maquette 10 l.501). */
  showAllLoaded?: boolean;
  /** Contenu à droite de la même rangée (champ de recherche de l'onglet Tables, maquette 11 l.236). */
  trailing?: ReactNode;
  /** Version de colonne (kanban) : le total seul. */
  compact?: boolean;
  /** Recherche en cours : la barre est atténuée. */
  busy?: boolean;
  /** Message de l'écran (recherche, fin de liste, chargement) : l'emporte sur l'annonce de page reçue. */
  announcement?: string;
}

/** « 50 fonctionnalités de plus chargées · 100 sur 1 000 » quand une page arrive et que le total n'a pas bougé. */
function useArrivalMessage(total: number, loaded: number, noun: CountNoun): string {
  const previous = useRef({ total, loaded });
  const [message, setMessage] = useState("");
  const { one, other, masculine } = noun;
  useEffect(() => {
    const before = previous.current;
    previous.current = { total, loaded };
    if (before.total !== total) return setMessage("");
    if (before.loaded === 0 || loaded <= before.loaded) return;
    const delta = loaded - before.loaded;
    const word = nounFor(delta, { one, other, masculine });
    setMessage(
      `${formatCount(delta)} ${word} de plus ${loadedWord(delta, { one, other, masculine })} · ${formatCount(loaded)} sur ${formatCount(total)}`,
    );
  }, [total, loaded, one, other, masculine]);
  return message;
}

const RESULT_NOUN: CountNoun = { one: "résultat", other: "résultats" };

function Summary({
  total,
  loaded,
  noun,
  filterLabel,
  query,
  showAllLoaded,
}: Pick<CountBarProps, "total" | "loaded" | "noun" | "filterLabel" | "query" | "showAllLoaded">) {
  const plural = total >= 2;
  const all = noun.masculine ? (plural ? "tous" : "tout") : plural ? "toutes" : "toute";
  const rest = [
    loaded < total ? `${formatCount(loaded)} ${loadedWord(loaded, noun)}` : "",
    showAllLoaded && loaded >= total && total > 0 ? `${all} ${loadedWord(total, noun)}` : "",
    filterLabel ?? "",
  ].filter(Boolean);
  const searching = query !== undefined && query !== "";
  return (
    // Deux blocs à 8 px (planche 12 l.53) : le total en gras, puis la suite ; l'espace reste pour la lecture.
    <p className="flex flex-wrap items-baseline gap-x-2">
      <strong className="font-semibold text-foreground">
        <span data-total>{formatCount(total)}</span>
        {` ${nounFor(total, searching ? RESULT_NOUN : noun)}`}
      </strong>{" "}
      {searching || rest.length > 0 ? (
        <span>
          {[searching ? `pour « ${query} »` : "", ...rest.map((part) => `· ${part}`)]
            .filter(Boolean)
            .join(" ")}
        </span>
      ) : null}
    </p>
  );
}

/**
 * Barre de compte au-dessus d'une liste (DESIGN.md v2.1 §5.3) : total en gras, éléments chargés, compteur de filtre, tri à droite.
 * La région `role="status"` n'annonce que l'arrivée d'une page ou le message de l'écran, jamais le texte visible.
 */
export function CountBar({
  total,
  loaded,
  noun,
  filterLabel,
  query,
  sort,
  showAllLoaded,
  trailing,
  compact = false,
  busy = false,
  announcement,
  className,
  ...props
}: CountBarProps) {
  const arrival = useArrivalMessage(total, loaded, noun);
  return (
    <div
      data-slot="count-bar"
      aria-busy={busy || undefined}
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-muted-foreground motion-safe:transition-opacity",
        busy && "opacity-60",
        className,
      )}
      {...props}
    >
      {compact ? (
        <strong data-total className="font-semibold text-foreground">
          {formatCount(total)}
        </strong>
      ) : (
        <Summary
          total={total}
          loaded={loaded}
          noun={noun}
          filterLabel={filterLabel}
          query={query}
          showAllLoaded={showAllLoaded}
        />
      )}
      {sort && !compact ? (
        <span data-slot="count-bar-sort" className="ml-auto inline-flex items-center gap-2">
          <span>Tri : {sort}</span>
          <Icon name="swap_vert" size={16} />
        </span>
      ) : null}
      {trailing && !compact ? (
        <div
          data-slot="count-bar-trailing"
          className="ml-auto flex min-w-0 items-center gap-2 max-md:w-full"
        >
          {trailing}
        </div>
      ) : null}
      <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement ?? arrival}
      </span>
    </div>
  );
}
