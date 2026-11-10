import type { AnchorHTMLAttributes, ComponentType, ReactNode } from "react";
import { primeIcon } from "../icons/cache.ts";
import * as arrowForward from "../icons/generated/arrow_forward.ts";
import * as schedule from "../icons/generated/schedule.ts";
import { Icon } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { AvatarGroup, type AvatarGroupPerson } from "./avatar-group.tsx";
import { Button } from "./button.tsx";
import { PhasePill, type ProjectPhase } from "./phase-pill.tsx";
import { ProgressChecklist, type ProgressStep } from "./progress-checklist.tsx";
import { type ProjectColorKey, ProjectTile } from "./project-tile.tsx";
import { SegmentedGauge } from "./segmented-gauge.tsx";

primeIcon("schedule", schedule);
primeIcon("arrow_forward", arrowForward);

type CardLink = ComponentType<AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }>;

export interface ProjectCardNext {
  title: string;
  /** Vrai : encart d'attention (`warning`, `schedule`) ; faux : neutre (`arrow_forward`). */
  attention: boolean;
}

export interface ProjectCardProps {
  href: string;
  name: string;
  initials: string;
  colorKey: ProjectColorKey;
  /** Ligne sous le nom : « Marie Lefèvre · Salon Lumière » ou « Aucun client invité » (écrite par l'appelant) ; `null` : aucune ligne (vue client). */
  client: string | null;
  phase: ProjectPhase;
  progress: { label: string; valueLabel: string; done: number; total: number };
  next: ProjectCardNext | null;
  people: readonly AvatarGroupPerson[];
  /** « Marie, il y a 2 h » ; absent, la ligne reste vide. */
  activity: string | null;
  LinkComponent?: CardLink;
  className?: string;
}

/** Texte de l'encart quand rien n'attend d'action. */
export const NO_NEXT_ACTION = "Rien n'attend d'action";

const NEXT_TONE = {
  warning: "border-alert-warning-border bg-alert-warning text-alert-warning-foreground",
  neutral: "border-border bg-surface text-foreground",
} as const;

function NextBox({ next }: { next: ProjectCardNext | null }) {
  const tone = next?.attention ? "warning" : "neutral";
  return (
    <span
      data-slot="project-card-next"
      data-tone={tone}
      className={cn(
        "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-meta",
        NEXT_TONE[tone],
      )}
    >
      <Icon name={next?.attention ? "schedule" : "arrow_forward"} size={16} />
      <span className="min-w-0 flex-1">{next?.title ?? NO_NEXT_ACTION}</span>
    </span>
  );
}

const CARD =
  "flex flex-col gap-3.5 rounded-dialog border border-border bg-background p-[18px] motion-safe:transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * Carte de projet (DESIGN.md §5.12, maquette 08 l.97-119) : un lien entier, tuile, pastille de phase, jauge, encart de
 * prochaine étape, avatars et activité. Son nom accessible vient du contenu visible (WCAG 2.5.3) : un `aria-label`
 * plus court que le texte affiché serait refusé par axe (`label-content-name-mismatch`).
 */
export function ProjectCard({
  href,
  name,
  initials,
  colorKey,
  client,
  phase,
  progress,
  next,
  people,
  activity,
  LinkComponent: Link = "a" as unknown as CardLink,
  className,
}: ProjectCardProps) {
  return (
    <Link href={href} data-slot="project-card" className={cn(CARD, className)}>
      <span className="flex items-start gap-3">
        <ProjectTile initials={initials} colorKey={colorKey} size={40} />
        <span className="flex min-w-0 flex-1 flex-col leading-snug">
          <span className="text-base font-semibold">{name}</span>
          {client === null ? null : (
            <span className="text-meta text-muted-foreground">{client}</span>
          )}
        </span>
        <PhasePill phase={phase} />
      </span>
      <span className="flex flex-col gap-1.5">
        <span className="flex justify-between text-meta">
          <span className="text-muted-foreground">{progress.label}</span>
          <span className="font-semibold">{progress.valueLabel}</span>
        </span>
        <SegmentedGauge done={progress.done} total={progress.total} max={10} />
      </span>
      <NextBox next={next} />
      <span className="flex items-center gap-2 text-caption font-normal text-muted-foreground">
        <AvatarGroup people={[...people]} max={3} size={24} />
        <span className="flex-1">{activity}</span>
      </span>
    </Link>
  );
}

export interface ProjectCardCreatingProps {
  /** Lien « Ouvrir le projet » (le projet existe dès la première étape). */
  href: string;
  name: string;
  initials: string;
  colorKey: ProjectColorKey;
  steps: readonly ProgressStep[];
  /** Phrase 12 muted sous la liste. */
  note?: string;
  /** Boutons d'action d'un échec (réessayer, changer de nom…), sous la phrase. */
  actions?: ReactNode;
  LinkComponent?: CardLink;
  className?: string;
}

/**
 * Carte de création (DESIGN.md §5.12, maquette 08 l.85-96) : cadre pointillé `--primary` sur `--diff-bg`, région
 * `status` unique, liste d'avancement, phrase et bouton « Ouvrir le projet ».
 */
export function ProjectCardCreating({
  href,
  name,
  initials,
  colorKey,
  steps,
  note,
  actions,
  LinkComponent: Link = "a" as unknown as CardLink,
  className,
}: ProjectCardCreatingProps) {
  return (
    <div
      role="status"
      data-slot="project-card-creating"
      className={cn(
        "flex flex-col gap-3 rounded-dialog border border-dashed border-primary bg-diff-bg p-[18px]",
        className,
      )}
    >
      <span className="flex items-center gap-2.5">
        <ProjectTile initials={initials} colorKey={colorKey} size={36} tone="soft" />
        <span className="flex-1 text-base font-semibold">{name}</span>
      </span>
      <ProgressChecklist items={steps} announce={false} />
      {note ? <span className="text-caption font-normal text-muted-foreground">{note}</span> : null}
      {actions}
      <Button asChild size="sm" className="self-start">
        <Link href={href}>
          Ouvrir le projet
          <Icon name="arrow_forward" size={18} />
        </Link>
      </Button>
    </div>
  );
}
