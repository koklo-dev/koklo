import type { Editor } from "@tiptap/react";

export interface SlashCommand {
  id: string;
  label: string;
  run: (editor: Editor) => void;
}

const ASIDE = {
  type: "blockquote",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "[!note]" }] },
    { type: "paragraph" },
  ],
};

/** Menu « / » minimal (décision 11) : paragraphe, titres 2 et 3, listes, tâches, tableau, citation, encadré, séparateur. */
export const SLASH_COMMANDS: SlashCommand[] = [
  { id: "paragraph", label: "Paragraphe", run: (e) => void e.chain().focus().setParagraph().run() },
  { id: "h2", label: "Titre 2", run: (e) => void e.chain().focus().setHeading({ level: 2 }).run() },
  { id: "h3", label: "Titre 3", run: (e) => void e.chain().focus().setHeading({ level: 3 }).run() },
  {
    id: "bullet",
    label: "Liste à puces",
    run: (e) => void e.chain().focus().toggleBulletList().run(),
  },
  {
    id: "ordered",
    label: "Liste numérotée",
    run: (e) => void e.chain().focus().toggleOrderedList().run(),
  },
  {
    id: "task",
    label: "Liste de tâches",
    run: (e) => void e.chain().focus().toggleTaskList().run(),
  },
  {
    id: "table",
    label: "Tableau",
    run: (e) => void e.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run(),
  },
  { id: "quote", label: "Citation", run: (e) => void e.chain().focus().toggleBlockquote().run() },
  { id: "aside", label: "Encadré", run: (e) => void e.chain().focus().insertContent(ASIDE).run() },
  { id: "rule", label: "Séparateur", run: (e) => void e.chain().focus().setHorizontalRule().run() },
];

/** Commandes dont le libellé contient la saisie après « / » (sans accent ni casse). */
export function filterSlash(query: string): SlashCommand[] {
  const fold = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const needle = fold(query);
  return SLASH_COMMANDS.filter((command) => fold(command.label).includes(needle));
}

/** Saisie « /xyz » dans le paragraphe courant (curseur à la fin) : la requête et la position du « / », sinon null. */
export interface SlashContext {
  query: string;
  from: number;
}

export function slashContext(editor: Editor): SlashContext | null {
  const { selection } = editor.state;
  if (!selection.empty) return null;
  const { $from } = selection;
  if ($from.parent.type.name !== "paragraph" || $from.depth !== 1) return null;
  const text = $from.parent.textContent;
  if (!text.startsWith("/") || /\s/.test(text) || $from.parentOffset !== text.length) return null;
  return { query: text.slice(1), from: $from.start() };
}
