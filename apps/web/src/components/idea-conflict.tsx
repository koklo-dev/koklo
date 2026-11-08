"use client";

import { Button, Card, InlineAlert } from "@koklo/ui";
import { useState } from "react";
import type { IdeaConflict } from "../lib/use-idea-autosave.ts";

function Version({ title, text }: { title: string; text: string }) {
  return (
    <Card className="flex min-w-0 flex-col gap-2 p-3">
      <h3 className="text-subsection-title">{title}</h3>
      <pre className="m-0 max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-code">
        {text || "(vide)"}
      </pre>
    </Card>
  );
}

/**
 * Conflit de version (B185) : la saisie est gardée ; « Voir les deux versions » les met côte à côte, le choix porte sur
 * la version entière (pas de choix par bloc).
 */
export function IdeaConflictNotice({
  conflict,
  onKeepMine,
  onTakeTheirs,
}: {
  conflict: IdeaConflict;
  onKeepMine: () => void;
  onTakeTheirs: () => void;
}) {
  const [open, setOpen] = useState(false);
  const who = conflict.theirs.author ?? "Quelqu'un";
  return (
    <div className="flex flex-col gap-3">
      <InlineAlert
        variant="warning"
        icon="warning"
        action={
          open ? undefined : { label: "Voir les deux versions", onClick: () => setOpen(true) }
        }
      >
        {who} a modifié cette page pendant que vous écriviez. Votre saisie est gardée.
      </InlineAlert>
      {open ? (
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Version title="Ma version" text={conflict.mine} />
            <Version title={`Leur version (${who})`} text={conflict.theirs.contentMd} />
          </div>
          <div className="flex flex-col gap-2 md:flex-row">
            <Button type="button" className="h-11 md:h-9" onClick={onKeepMine}>
              Garder la mienne
            </Button>
            <Button type="button" variant="outline" className="h-11 md:h-9" onClick={onTakeTheirs}>
              Prendre la leur
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
