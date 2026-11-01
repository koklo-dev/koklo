import { Icon, type IconName } from "@koklo/ui";
import { type FeatureWrite, WRITTEN_PHASES } from "../lib/use-feature-submit.ts";

type StepStatus = "todo" | "doing" | "done" | "failed" | "late";
interface Step {
  label: string;
  status: StepStatus;
  text: string;
}

const ICONS: Record<StepStatus, IconName> = {
  todo: "radio_button_unchecked",
  doing: "play_circle",
  done: "check_circle",
  failed: "warning",
  late: "schedule",
};
const TEXTS: Record<StepStatus, string> = {
  todo: "À faire",
  doing: "En cours…",
  done: "Terminé",
  failed: "Non enregistré",
  late: "Pas encore à jour",
};

const step = (label: string, status: StepStatus, text = TEXTS[status]): Step => ({
  label,
  status,
  text,
});

function writeStep(write: FeatureWrite): Step {
  const label = "Écriture dans la spec";
  const failedInBatch = write.phase === "failed" && write.failure?.source === "batch";
  if (failedInBatch) return step(label, "failed");
  if (write.phase === "tracking") {
    return write.batch?.status === "committing"
      ? step(label, "doing", "Écriture en cours…")
      : step(label, "doing", "En attente de son tour");
  }
  return WRITTEN_PHASES.includes(write.phase) ? step(label, "done") : step(label, "todo");
}

/** Les trois étapes d'un enregistrement d'après l'état de l'écriture (S-feature-form §4.4). */
function stepsOf(write: FeatureWrite): Step[] {
  const sendFailed = write.phase === "failed" && write.failure?.source === "submit";
  const list = step("Mise à jour de la liste", "todo");
  let index = list;
  if (write.phase === "indexing") index = step(list.label, "doing", "La liste se met à jour…");
  if (write.phase === "late") index = step(list.label, "late");
  if (write.phase === "saved") index = step(list.label, "done");
  const send =
    write.phase === "sending"
      ? step("Envoi", "doing")
      : step("Envoi", sendFailed ? "failed" : "done");
  return [send, writeStep(write), index];
}

/** Indicateur d'avancement : icône et texte à chaque étape (jamais la couleur seule). */
export function SaveProgress({ write, version }: { write: FeatureWrite; version: string | null }) {
  const steps = stepsOf(write);
  return (
    <ol aria-label="Avancement de l'enregistrement" className="flex flex-col gap-1.5 text-[13px]">
      {steps.map((item, position) => (
        <li key={item.label} className="flex flex-wrap items-center gap-2">
          <Icon
            name={ICONS[item.status]}
            size={18}
            className={item.status === "failed" ? "text-destructive" : "text-muted-foreground"}
          />
          <span className="font-medium">{item.label}</span>
          <span className="text-muted-foreground">{item.text}</span>
          {position === 1 && item.status === "done" && version ? (
            <span
              role="img"
              aria-label={`Version de la spec ${version}`}
              className="font-mono text-xs text-muted-foreground"
            >
              {version}
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
