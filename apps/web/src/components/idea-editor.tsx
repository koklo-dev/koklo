"use client";

import type { IdeaPage } from "@koklo/contract";
import { Prose, ProseInvite } from "@koklo/ui";
import { EditorContent, useEditor } from "@tiptap/react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AgentAction } from "../lib/idea-agent-labels.ts";
import { ideaExtensions } from "../lib/idea-editor-extensions.ts";
import { loadIdeaMarkdown, serializeIdeaMarkdown } from "../lib/idea-markdown.ts";
import {
  type ProposalSlot,
  proposalSlotsExtension,
  setProposalSlots,
} from "../lib/idea-proposal-slots.ts";
import type { Replacement } from "../lib/use-idea-autosave.ts";
import { IdeaSelectionBubble, openToolbarOnShortcut } from "./idea-selection-toolbar.tsx";
import { IdeaSlashMenu } from "./idea-slash-menu.tsx";

interface Props {
  page: IdeaPage;
  editable: boolean;
  replacement: Replacement | null;
  onChange: (contentMd: string) => void;
  onBlur: () => void;
  /** Propositions de l'agent à poser sous leur bloc d'ancre, rendues par `renderSlot` (TK-90). */
  slots?: ProposalSlot[];
  renderSlot?: (id: string) => ReactNode;
  /** Action de l'agent sur la sélection (Développer, Challenger...) ; absent = barre de mise en forme seule. */
  onAgentAction?: (action: AgentAction, selection: string) => void;
}

const NO_SLOTS: ProposalSlot[] = [];

/** Hôtes DOM des emplacements : ProseMirror les crée, React y rend par portail. */
function useSlotHosts() {
  const [hosts, setHosts] = useState<Record<string, HTMLElement>>({});
  const mount = useCallback(
    (id: string, element: HTMLElement) => setHosts((previous) => ({ ...previous, [id]: element })),
    [],
  );
  const unmount = useCallback(
    (id: string, element: HTMLElement) =>
      setHosts((previous) => {
        if (previous[id] !== element) return previous;
        const { [id]: _removed, ...rest } = previous;
        return rest;
      }),
    [],
  );
  return { hosts, host: { mount, unmount } };
}

/**
 * Éditeur TipTap restreint (ADR 0019) : Markdown en entrée et en sortie, rien d'autre n'est enregistré. Le contenu
 * hostile est rendu inerte au chargement (`sanitizeIdeaMarkdown`). En lecture seule, le même rendu sans saisie.
 */
export function IdeaEditor({
  page,
  editable,
  replacement,
  onChange,
  onBlur,
  slots = NO_SLOTS,
  renderSlot,
  onAgentAction,
}: Props) {
  const { hosts, host } = useSlotHosts();
  const handlers = useRef({ onChange, onBlur });
  const loaded = useRef<{ markdown: string | null; raw: string }>({ markdown: null, raw: "" });
  handlers.current = { onChange, onBlur };
  const editor = useEditor({
    extensions: [...ideaExtensions(), proposalSlotsExtension(host)],
    content: "",
    editable,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        "aria-label": `Contenu de la page ${page.title}`,
        "aria-multiline": "true",
        "aria-keyshortcuts": "Alt+F10",
      },
      handleKeyDown: openToolbarOnShortcut,
    },
    onUpdate: ({ editor: current }) => {
      // Une transaction que l'éditeur lance seul (nœud final ajouté, Markdown renormalisé) ne change rien à ce
      // que la personne voit : le contenu reste celui chargé, donc rien n'est enregistré à l'ouverture.
      const { markdown, raw } = loaded.current;
      const next = serializeIdeaMarkdown(current);
      handlers.current.onChange(next === markdown ? raw : next);
    },
    onBlur: () => handlers.current.onBlur(),
  });
  useEffect(() => {
    if (!editor) return;
    loadIdeaMarkdown(editor, page.contentMd);
    loaded.current = { markdown: serializeIdeaMarkdown(editor), raw: page.contentMd };
  }, [editor, page.contentMd]);
  useEffect(() => {
    if (!editor || !replacement) return;
    loadIdeaMarkdown(editor, replacement.contentMd);
    loaded.current = { markdown: serializeIdeaMarkdown(editor), raw: replacement.contentMd };
  }, [editor, replacement]);
  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);
  useEffect(() => {
    if (editor) setProposalSlots(editor, slots);
  }, [editor, slots]);
  if (!editor) return null;
  return (
    <div className="relative flex flex-col gap-[18px]">
      {editable ? <IdeaSelectionBubble editor={editor} onAgentAction={onAgentAction} /> : null}
      <Prose data-testid="idea-editor">
        <EditorContent editor={editor} />
      </Prose>
      {renderSlot
        ? slots.map((slot) => {
            const element = hosts[slot.id];
            return element ? createPortal(renderSlot(slot.id), element, slot.id) : null;
          })
        : null}
      {editable ? (
        <>
          <button
            type="button"
            onClick={() => editor.chain().focus("end").run()}
            className="w-fit rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ProseInvite />
          </button>
          <IdeaSlashMenu editor={editor} />
        </>
      ) : null}
    </div>
  );
}
