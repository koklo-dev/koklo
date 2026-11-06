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

function Summary({
  total,
  loaded,
  noun,
  filterLabel,
}: Pick<CountBarProps, "total" | "loaded" | "noun" | "filterLabel">) {
  const rest = [
    loaded < total ? `${formatCount(loaded)} ${loadedWord(loaded, noun)}` : "",
    filterLabel ?? "",
  ].filter(Boolean);
  return (
    <p>
      <strong data-total className="font-semibold text-foreground">
        {formatCount(total)}
      </strong>
      {` ${nounFor(total, noun)}`}
      {rest.map((part) => ` · ${part}`).join("")}
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
  sort,
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
        "flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-muted-foreground motion-safe:transition-opacity",
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
        <Summary total={total} loaded={loaded} noun={noun} filterLabel={filterLabel} />
      )}
      {sort && !compact ? (
        <span data-slot="count-bar-sort" className="ml-auto inline-flex items-center gap-1">
          <Icon name="swap_vert" size={16} />
          <span>Tri : {sort}</span>
        </span>
      ) : null}
      <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement ?? arrival}
      </span>
    </div>
  );
}
