import type { ProjectOverview } from "@koklo/contract";
import { NextStep, PhaseRail, StatCard } from "@koklo/ui";
import { statIcon } from "../lib/overview-labels.ts";
import { ShellLink } from "./shell-link.tsx";

/** Fil de phase dans une carte (maquette 07 l.88-101) ; les sous-titres viennent du serveur. */
export function OverviewPhase({ overview }: { overview: ProjectOverview }) {
  const subtitles = Object.fromEntries(
    overview.phaseSteps.map((step) => [step.key, step.subtitle]),
  );
  return (
    <section aria-label="Phases du projet" className="rounded-xl border bg-background px-6 py-5">
      <PhaseRail phase={overview.phase} subtitles={subtitles} />
    </section>
  );
}

/** Prochaine étape : lien ou bouton « Relancer » (`copy_link`), sans bouton quand rien n'attend d'action. */
export function OverviewNextStep({
  nextAction,
  onCopy,
}: {
  nextAction: NonNullable<ProjectOverview["nextAction"]>;
  onCopy: (href: string) => void;
}) {
  const { action } = nextAction;
  return (
    <NextStep
      tone={nextAction.tone}
      title={nextAction.title}
      body={nextAction.body}
      {...(action
        ? {
            action:
              action.kind === "copy_link"
                ? { label: action.label, onClick: () => onCopy(action.href) }
                : { label: action.label, href: action.href, LinkComponent: ShellLink },
          }
        : {})}
    />
  );
}

/** Indicateurs de la phase (maquette 07 l.113-122) : déjà filtrés par rôle et disponibilité par le serveur. */
export function OverviewStats({ stats }: { stats: ProjectOverview["stats"] }) {
  if (stats.length === 0) return null;
  return (
    <section
      aria-label="Indicateurs"
      className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]"
    >
      {stats.map((stat) => (
        <StatCard
          key={stat.key}
          icon={statIcon(stat.icon)}
          label={stat.label}
          value={stat.value}
          note={stat.note}
          density="comfortable"
          {...(stat.gauge ? { segments: stat.gauge } : {})}
        />
      ))}
    </section>
  );
}
