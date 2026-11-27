import { type ReactNode, useId } from "react";
import { Icon, type IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";

/** Grille des cartes du résumé (maquette 15 l.208) : 300 au moins, écart 12 ; une colonne sur téléphone. */
export function SummaryGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      data-slot="summary-grid"
      className={cn(
        "grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Carte du résumé client (DESIGN.md §5.28, maquette 15 l.209) : tuile à icône, titre, texte en mots simples. */
export function SummaryCard({
  icon,
  title,
  wide = false,
  children,
}: {
  icon: IconName;
  title: string;
  /** Sur toute la largeur (la dernière carte). */
  wide?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <article
      aria-labelledby={id}
      data-slot="summary-card"
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-xl border border-border px-[18px] py-4",
        wide && "col-span-full",
      )}
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="flex size-[34px] shrink-0 items-center justify-center rounded-[10px] bg-secondary text-secondary-foreground"
        >
          <Icon name={icon} size={18} />
        </span>
        <h2 id={id} className="m-0 text-[15px] font-semibold">
          {title}
        </h2>
      </div>
      <p className="m-0 whitespace-pre-line break-words text-sm leading-[1.6]">{children}</p>
    </article>
  );
}
