import { Badge, Icon, StatusBadge } from "@koklo/ui";
import type { Phase } from "../lib/creation-types.ts";

type StepState = "todo" | "running" | "done" | "failed" | "unavailable";

/** État des deux étapes selon la phase (design/screens/S-projects.md §3.1). */
export function stepStates(phase: Phase): [StepState, StepState] {
  switch (phase.name) {
    case "form":
      return [phase.stepOneFailure ? "failed" : "todo", "todo"];
    case "creating-project":
      return ["running", "todo"];
    case "ready":
      return ["done", "todo"];
    case "creating-repo":
      return ["done", "running"];
    case "failed":
      return ["done", "failed"];
    case "existing":
      return ["done", "done"];
    case "no-account":
      return ["done", "unavailable"];
  }
}

function StepStatus({ state }: { state: StepState }) {
  switch (state) {
    case "done":
      return <StatusBadge status="validated" label="Terminé" />;
    case "running":
      return (
        <span className="inline-flex items-center gap-1.5 text-[13px]">
          <Icon name="play_circle" size={18} />
          En cours…
        </span>
      );
    case "failed":
    case "unavailable":
      return (
        <Badge variant="outline" className="gap-1">
          <Icon name={state === "failed" ? "warning" : "block"} size={16} />
          {state === "failed" ? "Non créé" : "Non créé : aucun compte GitHub relié"}
        </Badge>
      );
    case "todo":
      return (
        <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <Icon name="radio_button_unchecked" size={18} />À faire
        </span>
      );
  }
}

const STEPS = ["Projet", "Dépôt de spec"] as const;

/** Les deux temps de la création, visibles dès l'ouverture : icône + texte, jamais la couleur seule. */
export function ProjectCreateSteps({ phase }: { phase: Phase }) {
  const states = stepStates(phase);
  return (
    <ol
      aria-label="Étapes de la création"
      className="flex list-decimal flex-col gap-2 pl-5 text-sm"
    >
      {STEPS.map((label, index) => (
        <li key={label}>
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">{label}</span>
            <StepStatus state={states[index] ?? "todo"} />
          </div>
        </li>
      ))}
    </ol>
  );
}
