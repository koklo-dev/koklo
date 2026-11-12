import type { ProjectOverview } from "@koklo/contract";
import { NextStep, PhaseRail, StatCard } from "@koklo/ui";
import { statIcon } from "../lib/overview-labels.ts";
import { ideaPath, specPath, ticketsPath } from "../lib/shell-routes.ts";
import { ShellLink } from "./shell-link.tsx";

type StepKey = ProjectOverview["phaseSteps"][number]["key"];

/** Espace de chaque étape ; Baseline 0 n'a pas de page avant TK-100 (B272), donc pas d'adresse. */
const STEP_PATHS: Partial<Record<StepKey, (projectId: string) => string>> = {
  idea: ideaPath,
  framing: (projectId) => specPath(projectId, "functional"),
  iterations: ticketsPath,
};

/** Étapes navigables : équipe seulement (espaces fermés au client), étapes terminées ou en cours, avec une page. */
function stepHrefs(projectId: string, overview: ProjectOverview) {
  if (overview.audience !== "team") return {};
  return Object.fromEntries(
    overview.phaseSteps.flatMap((step) => {
      const path = STEP_PATHS[step.key];
      return path && step.status !== "todo" ? [[step.key, path(projectId)]] : [];
    }),
  );
}

/** Fil de phase dans une carte (maquette 07 l.88-101) ; les sous-titres viennent du serveur, un clic ouvre l'espace de l'étape. */
export function OverviewPhase({
  overview,
  projectId,
}: {
  overview: ProjectOverview;
  projectId: string;
}) {
  const subtitles = Object.fromEntries(
    overview.phaseSteps.map((step) => [step.key, step.subtitle]),
  );
  return (
    <section aria-label="Phases du projet" className="rounded-xl border bg-background px-6 py-5">
      <PhaseRail
        phase={overview.phase}
        subtitles={subtitles}
        hrefs={stepHrefs(projectId, overview)}
        LinkComponent={ShellLink}
      />
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
