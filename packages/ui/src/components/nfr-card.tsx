import { type ReactNode, useId } from "react";
import { Icon, type IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { IconButton } from "./icon-button.tsx";
import { Pill } from "./pill.tsx";

/** Catégorie d'exigences (famille `StackLayer`, DESIGN.md §5.27) : titre à icône, compte, grille qui se remplit. */
export function NfrCategory({
  label,
  icon,
  count,
  children,
}: {
  label: string;
  icon: IconName;
  count: number;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} data-slot="nfr-category" className="flex flex-col gap-2">
      <h2
        id={id}
        className="m-0 flex items-center gap-2 text-caption font-semibold uppercase tracking-[0.06em] text-muted-foreground"
      >
        <Icon name={icon} size={16} />
        {label} <span className="font-mono font-medium tracking-normal">{count}</span>
      </h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-2.5">
        {children}
      </div>
    </section>
  );
}

/** Couverture connue d'une exigence (lot Qualité) : pastille et icône du pied. */
const COVERAGE = {
  covered: { label: "Couverte", tone: "success", icon: "fact_check", color: "validated" },
  uncovered: { label: "À couvrir", tone: "warning", icon: "pending", color: "pending" },
} as const;
const ICON_COLOR = {
  validated: "text-status-validated-foreground",
  pending: "text-status-pending-icon",
} as const;

export interface NfrCardProps {
  id: string;
  title: string;
  /** Cible mesurable, mise en avant. */
  target: string;
  statement: string;
  verification: string;
  /** Absente tant que la couverture n'est pas connue : aucune pastille. */
  coverage?: keyof typeof COVERAGE | undefined;
  /** Concernée par un changement en amont : contour ambre de 2 px. */
  stale?: boolean;
  /** Visée par une proposition de l'agent : contour pointillé. */
  proposed?: boolean;
  /** Crayon « Modifier NFR-nnn » (équipe qui écrit). */
  onEdit?: (() => void) | undefined;
}

function frameClass({ stale, proposed }: NfrCardProps): string {
  if (stale) return "border-2 border-status-pending-icon";
  return proposed ? "border border-dashed border-border-strong" : "border border-border";
}

function CardHead({ id, title, onEdit }: NfrCardProps) {
  return (
    <span className="flex items-center gap-2">
      <span className="rounded-[5px] bg-secondary px-1.5 py-0.5 font-mono text-code text-secondary-foreground">
        {id}
      </span>
      <span className="min-w-0 flex-1 break-words font-semibold">{title}</span>
      {onEdit ? (
        <IconButton
          type="button"
          size="sm"
          icon="edit"
          aria-label={`Modifier ${id}`}
          title="Modifier"
          className="size-7 max-md:size-11"
          onClick={onEdit}
        />
      ) : null}
    </span>
  );
}

function CardFoot({ verification, coverage }: NfrCardProps) {
  const known = coverage ? COVERAGE[coverage] : undefined;
  return (
    <span className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-2 text-caption font-normal">
      <Icon
        name={known?.icon ?? "fact_check"}
        size={16}
        className={known ? ICON_COLOR[known.color] : "text-muted-foreground"}
      />
      <span className="min-w-0 flex-1 break-words">{verification}</span>
      {known ? (
        <Pill size="sm" tone={known.tone}>
          {known.label}
        </Pill>
      ) : null}
    </span>
  );
}

/** Carte d'une exigence non fonctionnelle (DESIGN.md §5.27, maquette 14 l.267-273). */
export function NfrCard(props: NfrCardProps) {
  const { id, title, target, statement, stale } = props;
  return (
    <article
      data-slot="nfr-card"
      aria-label={`${id} ${title}${stale ? ", à revoir" : ""}`}
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-xl bg-background px-4 py-3.5",
        frameClass(props),
      )}
    >
      <CardHead {...props} />
      <span className="break-words text-[22px] font-semibold leading-[1.2] tracking-[-0.01em]">
        {target}
      </span>
      <span className="break-words text-meta leading-normal text-muted-foreground">
        {statement}
      </span>
      <CardFoot {...props} />
    </article>
  );
}
