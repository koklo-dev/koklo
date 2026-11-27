import { cn } from "../lib/cn.ts";
import { IdTag, type IdTagProps } from "./id-tag.tsx";

export interface IdTitleProps {
  /** Identifiant, affiché en `IdTag` tronqué (complet au survol). */
  id: string;
  title: string;
  size?: NonNullable<IdTagProps["size"]>;
  /** Titre sur une seule ligne, complet au survol ; sinon il passe à la ligne. */
  clipTitle?: boolean;
  titleClassName?: string;
}

/**
 * Identifiant puis titre sur une ligne de liste (DESIGN.md §5.5). Sous 112 px de place restante (identifiant long), le
 * titre passe sous l'identifiant au lieu d'être écrasé.
 */
export function IdTitle({ id, title, size = "default", clipTitle, titleClassName }: IdTitleProps) {
  return (
    <span
      data-slot="id-title"
      className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5"
    >
      <IdTag size={size} truncate>
        {id}
      </IdTag>
      <span
        title={clipTitle ? title : undefined}
        className={cn("min-w-0 flex-1 basis-28", clipTitle && "truncate", titleClassName)}
      >
        {title}
      </span>
    </span>
  );
}
