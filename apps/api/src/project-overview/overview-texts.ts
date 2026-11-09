import type { ProjectPhase } from "../project/project-shell.ts";

/** Accord en nombre, 0 compris (français) : « 0 page stable », « 1 page stable », « 2 pages stables ». */
export const plural = (count: number, one: string, many: string): string =>
  count < 2 ? one : many;

const DAY = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Paris",
});

/** Date en toutes lettres, au fuseau de Paris : « 5 novembre 2026 ». */
export const formatDay = (date: Date): string => DAY.format(date);

/** Deux initiales au plus ; « ? » sans nom lisible. */
export function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter((word) => word.length > 0);
  const initials = words.slice(0, 2).map((word) => Array.from(word)[0]?.toUpperCase() ?? "");
  return initials.join("") || "?";
}

/** Nombre de livrables de la spec (passation 21 §0) : « 2 livrables validés sur 7 ». */
export const DELIVERABLE_TOTAL = 7;

export interface PhaseStepFacts {
  phase: ProjectPhase;
  stablePages: number;
  totalPages: number;
  /** Projet existant arrivé au cadrage sans dossier d'idée (03 §4 : « Non utilisée »). */
  ideaUnused: boolean;
  /** Dernière version `idea-vN` dont le lot est commité (B260). */
  ideaVersion: { tag: string; frozenAt: Date } | null;
  validatedDeliverables: number;
  /** Date de la baseline posée ; `null` tant qu'elle ne l'est pas. */
  baselineAt: Date | null;
  sprintKey: string | null;
}

type Status = "done" | "current" | "todo";
export interface PhaseStep {
  key: "idea" | "framing" | "baseline" | "iterations";
  status: Status;
  subtitle: string;
}

const RANK: Record<ProjectPhase, number> = { idea: 0, framing: 1, iterations: 3 };
const statusAt = (index: number, phase: ProjectPhase): Status => {
  const rank = RANK[phase];
  if (index < rank) return "done";
  return index === rank ? "current" : "todo";
};

function ideaSubtitle(f: PhaseStepFacts, status: Status): string {
  if (status === "current") {
    const pages = plural(f.stablePages, "page stable", "pages stables");
    return `Dossier en cours, ${f.stablePages} ${pages} sur ${f.totalPages}`;
  }
  if (f.ideaUnused) return "Non utilisée";
  return f.ideaVersion
    ? `Version ${f.ideaVersion.tag} figée le ${formatDay(f.ideaVersion.frozenAt)}`
    : "Dossier stable";
}

function framingSubtitle(f: PhaseStepFacts, status: Status): string {
  if (status === "todo") return "Après le dossier d'idée";
  if (status === "done") return `${DELIVERABLE_TOTAL} livrables validés`;
  const noun = plural(f.validatedDeliverables, "livrable validé", "livrables validés");
  return `${f.validatedDeliverables} ${noun} sur ${DELIVERABLE_TOTAL}`;
}

function baselineSubtitle(f: PhaseStepFacts, status: Status): string {
  if (status !== "done") return "Posée à la validation du client";
  return f.baselineAt ? `Posée le ${formatDay(f.baselineAt)}` : "Posée";
}

/** Fil de phase : la phase transitoire `baseline` n'existe pas, l'étape passe de « à venir » à « terminée » (B272). */
export function phaseStepsOf(facts: PhaseStepFacts): PhaseStep[] {
  const idea = statusAt(0, facts.phase);
  const framing = statusAt(1, facts.phase);
  const baseline = facts.phase === "iterations" ? "done" : "todo";
  const iterations = statusAt(3, facts.phase);
  return [
    { key: "idea", status: idea, subtitle: ideaSubtitle(facts, idea) },
    { key: "framing", status: framing, subtitle: framingSubtitle(facts, framing) },
    { key: "baseline", status: baseline, subtitle: baselineSubtitle(facts, baseline) },
    {
      key: "iterations",
      status: iterations,
      subtitle:
        iterations === "current" && facts.sprintKey
          ? `Sprint ${facts.sprintKey} en cours`
          : "Sprints et demandes de changement",
    },
  ];
}
