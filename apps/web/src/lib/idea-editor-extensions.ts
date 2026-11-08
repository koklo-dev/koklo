import { TableKit } from "@tiptap/extension-table";
import { TaskList } from "@tiptap/extension-task-list";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { IdeaTaskItem } from "../components/idea-task-item.tsx";

/** Seuls http et https sont des liens ; tout autre schéma (javascript:, data:, vbscript:) est neutralisé. */
export const isSafeLinkUri = (uri: string): boolean => /^https?:\/\//i.test(uri.trim());

/**
 * Extensions de l'éditeur de l'espace Idée (ADR 0019) : un jeu restreint (titres 2 et 3, gras, italique, lien,
 * listes, tâches, tableau, citation, séparateur). Aucune image, aucun code, aucun HTML brut : le contenu hostile
 * n'a aucun nœud où se loger. Le Markdown est la seule forme enregistrée.
 */
export function ideaExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3] },
      code: false,
      codeBlock: false,
      strike: false,
      underline: false,
      link: {
        openOnClick: false,
        autolink: false,
        isAllowedUri: (url: string) => isSafeLinkUri(url),
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
      },
    }),
    TaskList,
    IdeaTaskItem.configure({ nested: false }),
    TableKit.configure({ table: { resizable: false } }),
    Markdown,
  ];
}
