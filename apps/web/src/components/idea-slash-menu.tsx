"use client";

import { type Editor, useEditorState } from "@tiptap/react";
import { useEffect, useMemo, useState } from "react";
import {
  filterSlash,
  type SlashCommand,
  type SlashContext,
  slashContext,
} from "../lib/idea-slash.ts";

function apply(editor: Editor, context: SlashContext, command: SlashCommand | undefined): void {
  if (!command) return;
  editor
    .chain()
    .deleteRange({ from: context.from, to: context.from + 1 + context.query.length })
    .run();
  command.run(editor);
}

function useSlash(editor: Editor) {
  const context = useEditorState({ editor, selector: ({ editor: e }) => slashContext(e) });
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const items = useMemo(() => (context ? filterSlash(context.query) : []), [context]);
  const open = context !== null && items.length > 0 && dismissed !== context.query;
  // biome-ignore lint/correctness/useExhaustiveDependencies: la sélection revient en tête quand la saisie change
  useEffect(() => setActive(0), [context?.query]);
  useEffect(() => {
    if (!open || !context) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown") setActive((i) => (i + 1) % items.length);
      else if (event.key === "ArrowUp") setActive((i) => (i - 1 + items.length) % items.length);
      else if (event.key === "Enter") apply(editor, context, items[active]);
      else if (event.key === "Escape") setDismissed(context.query);
      else return;
      event.preventDefault();
      event.stopPropagation();
    };
    const dom = editor.view.dom;
    dom.addEventListener("keydown", onKey, true);
    return () => dom.removeEventListener("keydown", onKey, true);
  }, [open, items, active, context, editor]);
  return { open, items, active, context };
}

/** Menu « / » (B190) : liste sous la ligne en cours, flèches, Entrée, Échap ; chaque entrée insère un bloc. */
export function IdeaSlashMenu({ editor }: { editor: Editor }) {
  const { open, items, active, context } = useSlash(editor);
  if (!open || !context) return null;
  const top =
    editor.view.coordsAtPos(context.from).bottom - editor.view.dom.getBoundingClientRect().top;
  return (
    <div
      role="listbox"
      aria-label="Insérer un bloc"
      className="absolute left-0 z-20 w-60 rounded-card border bg-popover p-1 text-popover-foreground shadow-md"
      style={{ top: top + 8 }}
    >
      {items.map((command, index) => (
        <div
          key={command.id}
          role="option"
          aria-selected={index === active}
          tabIndex={-1}
          onMouseDown={(event) => {
            event.preventDefault();
            apply(editor, context, command);
          }}
          className={`cursor-pointer rounded-md px-2.5 py-1.5 text-body ${index === active ? "bg-accent" : ""}`}
        >
          {command.label}
        </div>
      ))}
    </div>
  );
}
