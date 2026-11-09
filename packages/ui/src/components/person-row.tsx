import { cn } from "../lib/cn.ts";
import { ActorAvatar } from "./activity-feed.tsx";

/** Une personne du projet (DESIGN.md §5.11, maquette 07 l.185-188) : avatar 32, nom 13/500, rôle 12 atténué. */
export function PersonRow({
  name,
  initials,
  roleLabel,
  kind,
  className,
}: {
  name: string;
  initials: string;
  roleLabel: string;
  /** `client` : avatar ambre ; `team` : avatar doux. */
  kind: "client" | "team";
  className?: string;
}) {
  return (
    <div data-slot="person-row" className={cn("flex items-center gap-2.5", className)}>
      <ActorAvatar kind={kind} initials={initials} />
      <span className="flex min-w-0 flex-1 flex-col leading-snug">
        <span className="truncate text-meta font-medium">{name}</span>
        <span className="truncate text-caption font-normal text-muted-foreground">{roleLabel}</span>
      </span>
    </div>
  );
}
