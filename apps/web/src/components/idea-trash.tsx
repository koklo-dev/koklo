"use client";

import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Icon,
  InlineAlert,
} from "@koklo/ui";
import { ageOf } from "../lib/spec-age.ts";
import type { IdeaModel } from "../lib/use-idea-page.ts";

const RESTORE_WINDOW_DAYS = 30;

const expired = (deletedAt: string | null): boolean =>
  deletedAt !== null && Date.now() - Date.parse(deletedAt) > RESTORE_WINDOW_DAYS * 86_400_000;

/** Corbeille (30 jours) : pages supprimées, restaurables ; au-delà, la page reste masquée. */
export function IdeaTrash({ model }: { model: IdeaModel }) {
  const { trash, canWrite, actions } = model;
  if (trash.length === 0) return null;
  return (
    <Collapsible className="mt-3">
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start max-md:h-11"
        >
          <Icon name="history" size={18} />
          Corbeille ({trash.length})
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul aria-label="Pages supprimées" className="m-0 flex list-none flex-col gap-1 p-0 pt-1">
          {trash.map((page) => (
            <li key={page.id} className="flex items-center gap-2 px-2 text-meta">
              <span className="min-w-0 flex-1 truncate">
                {page.title}
                <span className="block text-caption text-muted-foreground">
                  Supprimée {page.deletedAt ? ageOf(page.deletedAt) : ""}
                </span>
              </span>
              {canWrite && !expired(page.deletedAt) ? (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  aria-label={`Restaurer la page ${page.title}`}
                  onClick={() =>
                    actions.restore.mutate({ projectId: model.projectId, pageId: page.id })
                  }
                >
                  Restaurer
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        {actions.restore.isError ? (
          <InlineAlert variant="error" icon="error" className="mt-2">
            Cette page ne peut plus être restaurée.
          </InlineAlert>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}
