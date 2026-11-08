import type { ComponentProps, ReactNode } from "react";
import { Icon } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";

/**
 * Corps de document de l'espace Idée (DESIGN.md §5.8, maquette 06) : paragraphe 15/1,65, h2 28/600, h3 18/600, listes,
 * citation, tableau. Les styles descendent sur les éléments, qu'ils viennent d'un rendu statique ou de l'éditeur.
 */
export function Prose({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="prose"
      className={cn(
        "flex flex-col gap-[18px] text-foreground",
        "[&_.ProseMirror]:flex [&_.ProseMirror]:flex-col [&_.ProseMirror]:gap-[18px] [&_.ProseMirror]:outline-none",
        "[&_li_p]:leading-normal [&_ul]:leading-normal [&_ol]:leading-normal",
        "[&_p]:my-0 [&_p]:text-[length:var(--text-prose-body-size)] [&_p]:leading-[var(--text-prose-body-leading)]",
        "[&_h2]:mt-0 [&_h2]:mb-0 [&_h2]:text-[length:var(--text-prose-title-size)] [&_h2]:leading-[1.2] [&_h2]:font-semibold [&_h2]:tracking-[-0.02em]",
        "[&_h3]:mt-2 [&_h3]:mb-0 [&_h3]:text-[length:var(--text-prose-heading-size)] [&_h3]:font-semibold",
        "[&_ul]:my-0 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5 [&_ul]:pl-[22px] [&_ul]:text-[length:var(--text-prose-body-size)]",
        "[&_ol]:my-0 [&_ol]:flex [&_ol]:flex-col [&_ol]:gap-1.5 [&_ol]:pl-[22px] [&_ol]:text-[length:var(--text-prose-body-size)]",
        "[&_ul]:list-disc [&_ol]:list-decimal [&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:pl-0 [&_ul[data-type=taskList]]:gap-2",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-border-strong [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground",
        "[&_hr]:my-2 [&_hr]:border-border",
        "[&_a]:text-primary [&_a]:underline [&_code]:font-mono [&_code]:text-code",
        "[&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1.5 [&_td]:text-left [&_th]:border [&_th]:border-border [&_th]:bg-secondary [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left",
        className,
      )}
      {...props}
    />
  );
}

/** Chemin du fichier publié au-dessus du titre : mono 12, `--muted-foreground`. */
export function ProsePath({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="prose-path"
      className={cn("font-mono text-code text-muted-foreground", className)}
      {...props}
    />
  );
}

/** Invite d'un document vide : « Écrire, ou taper « / » pour insérer un bloc ». */
export function ProseInvite({ children }: { children?: ReactNode }) {
  return (
    <p
      data-slot="prose-invite"
      className="flex items-center gap-2 py-1.5 text-body text-muted-foreground"
    >
      <Icon name="add" size={18} />
      {children ?? "Écrire, ou taper « / » pour insérer un bloc"}
    </p>
  );
}

/** Disposition d'une tâche (maquette 06, l.123-125) : case puis texte sur la même ligne, écart de 10. */
export const taskItemClassName =
  "flex items-start gap-2.5 text-[length:var(--text-prose-body-size)]";

function TaskIcon({ checked, title }: { checked: boolean; title?: string }) {
  return (
    <Icon
      name={checked ? "check_box" : "check_box_outline_blank"}
      size={20}
      fill={checked}
      tone={checked ? "primary" : "muted"}
      title={title}
    />
  );
}

/** Tâche en lecture : `check_box` 20 (`--primary` cochée, `--muted-foreground` sinon), état dit par le titre de l'icône. */
export function TaskItem({
  checked,
  children,
  className,
  ...props
}: { checked: boolean } & ComponentProps<"li">) {
  return (
    <li
      data-slot="task-item"
      data-checked={checked}
      className={cn(taskItemClassName, className)}
      {...props}
    >
      <TaskIcon checked={checked} title={checked ? "Faite" : "À faire"} />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

export interface TaskCheckboxProps extends Omit<ComponentProps<"button">, "onChange" | "role"> {
  checked: boolean;
  /** Nom accessible : le texte de la tâche. */
  label: string;
  onCheckedChange?: (checked: boolean) => void;
}

/**
 * Case d'une tâche modifiable (éditeur de l'espace Idée) : même icône 20 que `TaskItem`, dans une cible de 24
 * (WCAG 2.5.8) sans décaler la ligne ; `role="checkbox"` et `aria-checked`, nom = texte de la tâche.
 */
export function TaskCheckbox({
  checked,
  label,
  onCheckedChange,
  className,
  ...props
}: TaskCheckboxProps) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: case dans un éditeur, hors formulaire : un bouton role=checkbox garde la cible de 24 px et le nom de la tâche
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      data-slot="task-checkbox"
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        "-m-0.5 flex size-6 shrink-0 items-center justify-center rounded-sm border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
        className,
      )}
      {...props}
    >
      <TaskIcon checked={checked} />
    </button>
  );
}
