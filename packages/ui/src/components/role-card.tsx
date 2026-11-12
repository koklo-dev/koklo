import type { IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { IconButton } from "./icon-button.tsx";
import { IconTile, type IconTileTone } from "./icon-tile.tsx";

/** Teintes et icônes cycliques des rôles (maquette 10 l.588) : décoratives, le nom porte le sens. */
const CYCLE: ReadonlyArray<{ tone: IconTileTone; icon: IconName }> = [
  { tone: "warning", icon: "person" },
  { tone: "soft", icon: "support_agent" },
  { tone: "success", icon: "shield_person" },
];

export interface RoleCardProps {
  id: string;
  name: string;
  description?: string | undefined;
  /** Rang du rôle dans la liste : choisit la teinte et l'icône. */
  index: number;
  selected?: boolean;
  /** Équipe qui écrit : icône « Modifier RL-… ». */
  onEdit?: () => void;
  className?: string;
}

/** Carte d'un rôle (DESIGN.md §5.16, maquette 10 l.250-256) : tuile, nom, identifiant mono 11, description. */
export function RoleCard({
  id,
  name,
  description,
  index,
  selected = false,
  onEdit,
  className,
}: RoleCardProps) {
  const style = CYCLE[index % CYCLE.length] as (typeof CYCLE)[number];
  return (
    <article
      data-slot="role-card"
      data-spec-id={id}
      aria-current={selected || undefined}
      className={cn(
        "flex items-start gap-3 rounded-xl border bg-background px-4 py-3.5",
        selected ? "border-primary" : "border-border",
        className,
      )}
    >
      <IconTile icon={style.icon} tone={style.tone} size={40} fill={false} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-x-2">
          <h3 className="font-semibold">{name}</h3>
          <span className="font-mono text-code-sm text-muted-foreground">{id}</span>
        </div>
        {description ? <p className="m-0 text-meta text-muted-foreground">{description}</p> : null}
      </div>
      {onEdit ? (
        <IconButton
          icon="edit"
          size="sm"
          aria-label={`Modifier ${id}`}
          className="size-7 max-md:size-11"
          onClick={onEdit}
        />
      ) : null}
    </article>
  );
}
