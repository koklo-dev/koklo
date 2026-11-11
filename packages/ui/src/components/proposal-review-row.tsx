import { Icon } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { IdTag } from "./id-tag.tsx";
import { PROPOSAL_STATE, type ProposalReviewItem } from "./proposal-review-types.ts";

/** État d'une proposition : icône pleine ou au contour avec son libellé accessible (jamais la couleur seule). */
export function ProposalStateIcon({ status }: { status: ProposalReviewItem["status"] }) {
  const state = PROPOSAL_STATE[status];
  return (
    <Icon name={state.icon} size={18} fill={state.fill} tone={state.tone} title={state.label} />
  );
}

/** Contenu d'un élément de la liste (maquette 10 l.542-546) : identifiant, titre, état, sous-titre. */
export function ProposalRowContent({ item }: { item: ProposalReviewItem }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
      <span className="flex items-center gap-2">
        <IdTag>{item.ref}</IdTag>
        <span
          className={cn(
            "min-w-0 flex-1 text-body font-semibold",
            item.status === "rejected" && "text-muted-foreground",
          )}
        >
          {item.title}
        </span>
        <ProposalStateIcon status={item.status} />
      </span>
      {item.subtitle ? (
        <span className="text-caption font-normal text-muted-foreground">{item.subtitle}</span>
      ) : null}
    </span>
  );
}

export interface ProposalRowProps {
  item: ProposalReviewItem;
  selected: boolean;
  setSize: number;
  position: number;
  onSelect: (id: string) => void;
}

/** Élément de la liste à plat ou d'un petit groupe : bouton pleine largeur, courant sur `--secondary`. */
export function ProposalRow({ item, selected, setSize, position, onSelect }: ProposalRowProps) {
  return (
    <li aria-setsize={setSize} aria-posinset={position}>
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        onClick={() => onSelect(item.id)}
        className={cn(
          "flex min-h-[52px] w-full rounded-lg border px-3 py-2 outline-none motion-safe:transition-colors duration-150 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
          selected ? "border-primary bg-secondary" : "border-transparent bg-transparent",
        )}
      >
        <ProposalRowContent item={item} />
      </button>
    </li>
  );
}

/** Six lignes fantômes de 44 px pendant la génération (maquette 10 l.108-111), masquées aux lecteurs d'écran. */
export function ProposalSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  const keys = Array.from({ length: rows }, (_, row) => `skeleton-${row}`);
  const widths = ["w-3/5", "w-2/5", "w-[70%]", "w-1/2"];
  return (
    <div
      aria-hidden="true"
      data-slot="proposal-skeleton"
      className={cn("flex flex-col gap-2.5", className)}
    >
      {keys.map((key, row) => (
        <div key={key} className="flex h-11 items-center gap-3.5 rounded-card border px-3.5">
          <span className="h-[18px] w-[46px] rounded-[5px] bg-surface" />
          <span
            className={cn(
              "h-3.5 rounded-md bg-surface motion-safe:animate-pulse",
              widths[row % widths.length],
            )}
          />
        </div>
      ))}
    </div>
  );
}
