"use client";

import { Button, IconButton, Input } from "@koklo/ui";
import { PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { type Editor, useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import {
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { AGENT_ACTIONS, type AgentAction } from "../lib/idea-agent-labels.ts";
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

/** Actions de l'agent sur le passage sélectionné (TK-90) : la consigne vient du serveur, jamais du client. */
function AgentActions({
  editor,
  onAction,
}: {
  editor: Editor;
  onAction: (action: AgentAction, selection: string) => void;
}) {
  const selection = () => {
    const { from, to } = editor.state.selection;
    return editor.state.doc.textBetween(from, to, "\n");
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: groupe de boutons nommé, fieldset inadapté
    <div
      role="group"
      aria-label="Actions de l'agent"
      className="flex flex-wrap items-center gap-1 border-l pl-1"
    >
      {AGENT_ACTIONS.map(({ action, label }) => (
        <Button
          key={action}
          type="button"
          variant="ghost"
          size="xs"
          icon="wand_stars"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onAction(action, selection())}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}

const TOOLBAR_LABEL = "Mise en forme";

/** Boutons de la barre (hors formulaire du lien) : les éléments que les flèches parcourent. */
const items = (bar: HTMLElement) =>
  [...bar.querySelectorAll<HTMLElement>("button")].filter((el) => !el.closest("form"));

/** Éditeurs dont la barre a été fermée par Échap pour la sélection en cours (rouverte par toute nouvelle sélection). */
const dismissedBars = new WeakSet<Element>();

/** Clé du plugin du menu flottant, pour lui adresser des ordres. */
const BAR_KEY = new PluginKey("ideaSelectionBar");

/** Ordre direct au plugin du menu flottant (méta `bubbleMenu`) : un `tr` vide ne le ferait pas recalculer. */
const order = (view: EditorView, meta: "show" | "hide") =>
  view.dispatch(view.state.tr.setMeta(BAR_KEY, meta));

/**
 * Alt+F10 depuis l'éditeur (B251) : met le focus sur le premier bouton de la barre, quand elle est affichée.
 * Tab est pris par l'indentation des listes, la barre ne peut pas en dépendre (WCAG 2.1.1).
 */
export function focusSelectionToolbar(view: EditorView): boolean {
  const toolbar = () =>
    document.querySelector<HTMLElement>(`[role="toolbar"][aria-label="${TOOLBAR_LABEL}"]`);
  if (dismissedBars.delete(view.dom)) order(view, "show");
  // Le plugin réaffiche la barre au tour suivant : on réessaie quelques images avant d'abandonner.
  const attempt = (left: number) => {
    const first = toolbar() ? items(toolbar() as HTMLElement)[0] : undefined;
    first?.focus();
    if (document.activeElement !== first && left > 0)
      requestAnimationFrame(() => attempt(left - 1));
  };
  attempt(60);
  return true;
}

/** `handleKeyDown` de l'éditeur : Alt+F10 avec une sélection ouvre la barre au clavier. */
export function openToolbarOnShortcut(view: EditorView, event: globalThis.KeyboardEvent): boolean {
  if (!(event.altKey && event.key === "F10") || view.state.selection.empty) return false;
  event.preventDefault();
  return focusSelectionToolbar(view);
}

/** Tabulation itinérante : un seul bouton à la fois dans l'ordre de tabulation, flèches, Origine, Fin, Échap. */
function useRovingToolbar(onEscape: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const sync = (active?: HTMLElement) => {
    if (!ref.current) return;
    const all = items(ref.current);
    const current = active ?? all.find((el) => el.tabIndex === 0) ?? all[0];
    for (const el of all) el.tabIndex = el === current ? 0 : -1;
  };
  useEffect(() => sync());
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      return onEscape();
    }
    const all = ref.current ? items(ref.current) : [];
    const at = all.indexOf(event.target as HTMLElement);
    const target = {
      ArrowRight: all[(at + 1) % all.length],
      ArrowLeft: all[(at - 1 + all.length) % all.length],
      Home: all[0],
      End: all.at(-1),
    }[event.key];
    if (at < 0 || !target) return;
    event.preventDefault();
    target.focus();
  };
  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    if (ref.current && items(ref.current).includes(event.target)) sync(event.target);
  };
  return { ref, onKeyDown, onFocus };
}

/** Barre de la sélection (décision 11, B189) : gras, italique, lien, et les actions de l'agent quand il est actif. */
export function IdeaSelectionToolbar({
  editor,
  onAgentAction,
  onEscape,
}: {
  editor: Editor;
  onAgentAction?: ((action: AgentAction, selection: string) => void) | undefined;
  /** Échap dans la barre : l'appelant la ferme (le focus revient à l'éditeur). */
  onEscape?: () => void;
}) {
  const [linking, setLinking] = useState(false);
  const roving = useRovingToolbar(() => {
    editor.view.focus(); // synchrone : `commands.focus()` attend une image, Alt+F10 pourrait arriver avant
    onEscape?.();
  });
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
      ref={roving.ref}
      onKeyDown={roving.onKeyDown}
      onFocus={roving.onFocus}
      role="toolbar"
      aria-label={TOOLBAR_LABEL}
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
      {onAgentAction && state.selected ? (
        <AgentActions editor={editor} onAction={onAgentAction} />
      ) : null}
    </div>
  );
}

/** Parent qui défile (l'article dès 1024 px, la fenêtre sinon) : la barre flottante suit la sélection dans les deux cas. */
function scrollParent(dom: HTMLElement): HTMLElement | Window {
  const article = dom.closest("article");
  return article && getComputedStyle(article).overflowY === "auto" ? article : window;
}

/** Barre de la sélection en menu flottant (B249) : hors du flux, ancrée à la sélection, visible dans la colonne qui défile. */
export function IdeaSelectionBubble({
  editor,
  onAgentAction,
}: {
  editor: Editor;
  onAgentAction?: ((action: AgentAction, selection: string) => void) | undefined;
}) {
  useEffect(() => {
    const reopen = () => dismissedBars.delete(editor.view.dom);
    editor.on("selectionUpdate", reopen);
    return () => {
      editor.off("selectionUpdate", reopen);
    };
  }, [editor]);
  const wrapper = useRef<HTMLDivElement>(null);
  // Le plugin pose `tabindex="0"` sur l'enveloppe : un arrêt de tabulation sans rôle ni nom (F16). On le retire.
  useEffect(() => {
    const element = wrapper.current;
    if (!element) return;
    const calm = () => {
      if (element.tabIndex !== -1) element.tabIndex = -1;
    };
    calm();
    const observer = new MutationObserver(calm);
    observer.observe(element, { attributes: true, attributeFilter: ["tabindex"] });
    return () => observer.disconnect();
  }, []);
  return (
    <BubbleMenu
      ref={wrapper}
      editor={editor}
      pluginKey={BAR_KEY}
      className="z-20 w-max max-w-[min(32rem,calc(100vw-1rem))]"
      shouldShow={({ editor: e }) =>
        !e.state.selection.empty && !dismissedBars.has(editor.view.dom)
      }
      options={{
        placement: "top",
        offset: 8,
        flip: true,
        shift: { padding: 8 },
        scrollTarget: scrollParent(editor.view.dom),
      }}
    >
      <IdeaSelectionToolbar
        editor={editor}
        onAgentAction={onAgentAction}
        onEscape={() => {
          dismissedBars.add(editor.view.dom);
          order(editor.view, "hide");
        }}
      />
    </BubbleMenu>
  );
}
