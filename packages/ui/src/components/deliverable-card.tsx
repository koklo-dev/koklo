import { Icon, type IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import type { ShellLink } from "./app-shell.tsx";
import { Card } from "./card.tsx";
import { DeliverableStatus, type DeliverableStatusValue } from "./deliverable-status.tsx";
import { IconTile } from "./icon-tile.tsx";
import { SegmentedGauge } from "./segmented-gauge.tsx";

export type DeliverableCardProps = {
  icon: IconName;
  title: string;
  /** Contenu en une ligne (« 7 fonctionnalités »). */
  content: string;
  status: DeliverableStatusValue;
  /** Avancement : `done` sur `total` crans ; absent, pas de jauge. */
  gauge?: { done: number; total: number };
  /** Texte d'avancement à gauche, sous la jauge (« 4 fonctionnalités validées sur 7 »). */
  progress: string;
  /** Valideur à droite : `client` en gras avec `person`, `team` atténué avec `groups`. */
  validator: { kind: "client" | "team"; label: string };
  /** Carte livrée : lien. Absente avec `soon` : carte non interactive, « Bientôt disponible ». */
  href?: string;
  soon?: boolean;
  LinkComponent?: ShellLink;
  className?: string;
};

function Body({
  icon,
  title,
  content,
  status,
  gauge,
  progress,
  validator,
  soon,
}: Pick<
  DeliverableCardProps,
  "icon" | "title" | "content" | "status" | "gauge" | "progress" | "validator" | "soon"
>) {
  const client = validator.kind === "client";
  return (
    <>
      <span className="flex items-center gap-2.5">
        <IconTile icon={icon} size={32} fill={false} />
        <span className="flex-1 text-subsection-title">{title}</span>
        <DeliverableStatus status={soon ? "todo" : status} />
      </span>
      <span className="text-meta text-muted-foreground">{content}</span>
      {gauge && !soon ? (
        <SegmentedGauge
          done={gauge.done}
          total={gauge.total}
          height={5}
          tone={status === "validated" ? "validated" : "primary"}
        />
      ) : null}
      <span className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-caption font-normal">
        <span className="text-muted-foreground">{progress}</span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5",
            client ? "font-semibold text-foreground" : "text-muted-foreground",
          )}
        >
          <Icon name={client ? "person" : "groups"} size={16} />
          {validator.label}
        </span>
      </span>
    </>
  );
}

/**
 * Carte de livrable du cadrage (DESIGN.md §5.11, maquette 07 l.133-145) : tuile 32, nom, statut, contenu, jauge de
 * 5, avancement et valideur. Livrée : toute la carte est un seul lien, son nom accessible est son texte visible (WCAG 2.5.3). `soon` : non interactive, sans jauge. Sans `href` : non interactive, jauge conservée.
 */
export function DeliverableCard({
  href,
  soon = false,
  LinkComponent: Link = "a" as unknown as ShellLink,
  className,
  ...body
}: DeliverableCardProps) {
  const layout = "flex flex-col gap-2.5 px-4 py-3.5";
  if (soon) {
    return (
      <Card data-state="soon" className={cn(layout, className)}>
        <Body {...body} soon />
      </Card>
    );
  }
  if (!href) {
    // Livrée mais sans lien (le rôle ne peut pas ouvrir l'écran) : carte lisible, non interactive.
    return (
      <Card className={cn(layout, className)}>
        <Body {...body} />
      </Card>
    );
  }
  return (
    <Card variant="interactive" asChild className={cn(layout, className)}>
      <Link href={href}>
        <Body {...body} />
      </Link>
    </Card>
  );
}
