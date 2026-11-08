import {
  DeliverableStatus,
  type DeliverableStatusValue,
  LifecycleStatus,
  PriorityIndicator,
  ValidationStatus,
} from "@koklo/ui";
import {
  FEATURE_PRIORITIES,
  LIFECYCLE_RULES,
  SCREEN_LABELS,
  TICKET_PRIORITIES,
} from "./dev-ui-data.ts";
import { DevUiFrame, DevUiNote, DevUiRow, DevUiSection } from "./dev-ui-frame.tsx";

const DELIVERABLES: DeliverableStatusValue[] = ["todo", "in_progress", "pending", "validated"];
const VALIDATIONS = ["validated", "pending", "revise", "unsubmitted"] as const;

/** Section 3 de la galerie : langage des statuts (S-dev-ui §3). */
export function DevUiStatuses() {
  return (
    <DevUiSection id="dev-ui-statuses" title="3. Langage des statuts">
      <DevUiFrame title="Cycle de vie d'une fonctionnalité">
        <ul className="flex flex-col gap-2">
          {LIFECYCLE_RULES.map(({ stage, rule }) => (
            <li key={stage} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <LifecycleStatus stage={stage} />
              <span className="text-meta text-muted-foreground">{rule}</span>
            </li>
          ))}
        </ul>
      </DevUiFrame>
      <DevUiFrame title="Validation client">
        <DevUiRow>
          {VALIDATIONS.map((status) => (
            <ValidationStatus key={status} status={status} />
          ))}
        </DevUiRow>
        <DevUiNote>Libellés d'écran</DevUiNote>
        <DevUiRow>
          {SCREEN_LABELS.map((item) => (
            <ValidationStatus key={item.label} {...item} />
          ))}
        </DevUiRow>
      </DevUiFrame>
      <DevUiFrame title="Statut d'un livrable">
        <DevUiRow>
          {DELIVERABLES.map((status) => (
            <DeliverableStatus key={status} status={status} />
          ))}
        </DevUiRow>
        <DevUiNote>Compact</DevUiNote>
        <DevUiRow>
          {DELIVERABLES.map((status) => (
            <DeliverableStatus key={status} status={status} compact />
          ))}
        </DevUiRow>
        <DevUiNote>Compact, libellé masqué</DevUiNote>
        <DevUiRow>
          {DELIVERABLES.map((status) => (
            <DeliverableStatus key={status} status={status} compact hideLabel />
          ))}
        </DevUiRow>
      </DevUiFrame>
      <DevUiFrame title="Priorité">
        <DevUiRow>
          {FEATURE_PRIORITIES.map((p) => (
            <PriorityIndicator key={p.label} {...p} />
          ))}
        </DevUiRow>
        <DevUiNote>Barres seules (ligne de liste), libellé en nom accessible</DevUiNote>
        <DevUiRow>
          {FEATURE_PRIORITIES.map((p) => (
            <PriorityIndicator key={p.label} {...p} barsOnly />
          ))}
        </DevUiRow>
        <DevUiNote>Tickets</DevUiNote>
        <DevUiRow>
          {TICKET_PRIORITIES.map((p) => (
            <PriorityIndicator key={p.label} {...p} />
          ))}
        </DevUiRow>
      </DevUiFrame>
    </DevUiSection>
  );
}
