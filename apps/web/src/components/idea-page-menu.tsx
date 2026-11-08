"use client";

import type { IdeaPageSummary } from "@koklo/contract";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
} from "@koklo/ui";
import { useRef } from "react";

export interface PageMenuActions {
  onRename: () => void;
  onInsertAfter: () => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}

/** Menu d'une page (Renommer, Insérer après, Monter, Descendre, Supprimer) : au clavier comme à la souris. */
export function IdeaPageMenu({
  page,
  title,
  first,
  last,
  actions,
}: {
  page: IdeaPageSummary;
  title: string;
  first: boolean;
  last: boolean;
  actions: PageMenuActions;
}) {
  // Une action qui déplace le focus (titre à renommer, confirmation) ne le laisse pas revenir au bouton du menu.
  const keepFocus = useRef(false);
  const moveFocus = (run: () => void) => () => {
    keepFocus.current = true;
    run();
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          variant="ghost"
          icon="more_horiz"
          aria-label={`Actions de la page ${title}`}
          className="size-8 shrink-0 max-md:size-11"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(event) => {
          if (!keepFocus.current) return;
          keepFocus.current = false;
          event.preventDefault();
        }}
      >
        <DropdownMenuItem onSelect={moveFocus(actions.onRename)}>Renommer</DropdownMenuItem>
        <DropdownMenuItem onSelect={moveFocus(actions.onInsertAfter)}>
          Insérer après
        </DropdownMenuItem>
        <DropdownMenuItem disabled={first} onSelect={() => actions.onMove(-1)}>
          Monter
        </DropdownMenuItem>
        <DropdownMenuItem disabled={last} onSelect={() => actions.onMove(1)}>
          Descendre
        </DropdownMenuItem>
        {page.required ? null : (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={moveFocus(actions.onDelete)}>Supprimer</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
