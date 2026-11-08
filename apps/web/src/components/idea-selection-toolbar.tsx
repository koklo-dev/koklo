"use client";

import { IconButton, Input } from "@koklo/ui";
import { type Editor, useEditorState } from "@tiptap/react";
import { type FormEvent, useState } from "react";
import { isSafeLinkUri } from "../lib/idea-editor-extensions.ts";

function LinkForm({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const [url, setUrl] = useState("https://");
  const [invalid, setInvalid] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!isSafeLinkUri(url)) return setInvalid(true);
    editor.chain().focus().setLink({ href: url.trim() }).run();
    onDone();
  };
  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <Input
        aria-label="Adresse du lien"
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? "idea-link-error" : undefined}
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        className="h-9 w-64 max-w-full"
      />
      <IconButton variant="ghost" icon="check" aria-label="Poser le lien" type="submit" />
      {invalid ? (
        <span id="idea-link-error" className="text-caption text-destructive">
          Adresse en http ou https seulement.
        </span>
      ) : null}
    </form>
  );
}

/** Barre minimale (décision 11, B189) : gras, italique, lien, visible quand du texte est sélectionné. */
export function IdeaSelectionToolbar({ editor }: { editor: Editor }) {
  const [linking, setLinking] = useState(false);
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      selected: !e.state.selection.empty,
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      link: e.isActive("link"),
    }),
  });
  if (!state.selected && !linking) return null;
  return (
    <div
      role="toolbar"
      aria-label="Mise en forme"
      className="flex flex-wrap items-center gap-1 rounded-card border bg-card p-1"
    >
      <IconButton
        variant="ghost"
        icon="format_bold"
        aria-label="Gras"
        aria-pressed={state.bold}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <IconButton
        variant="ghost"
        icon="format_italic"
        aria-label="Italique"
        aria-pressed={state.italic}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <IconButton
        variant="ghost"
        icon="link"
        aria-label={state.link ? "Retirer le lien" : "Lien"}
        aria-pressed={state.link}
        onClick={() => {
          if (state.link) editor.chain().focus().unsetLink().run();
          else setLinking((open) => !open);
        }}
      />
      {linking ? <LinkForm editor={editor} onDone={() => setLinking(false)} /> : null}
    </div>
  );
}
