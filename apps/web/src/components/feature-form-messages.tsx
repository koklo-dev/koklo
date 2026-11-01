"use client";

import { Alert, Button, Icon } from "@koklo/ui";
import type { ReactNode } from "react";
import { FIELD_LABELS } from "../lib/feature-form-ids.ts";
import type { FeatureFormModel } from "../lib/use-feature-form.ts";
import type { FeatureWrite } from "../lib/use-feature-submit.ts";
import { DraftBanner } from "./draft-banner.tsx";
import { FormSummary, SaveErrorAlert } from "./feature-form-errors.tsx";

const SLOW =
  "L'enregistrement prend plus de temps que prévu. Il continue sans vous : votre saisie est gardée.";
const LATE = "Votre modification est enregistrée. La liste se mettra à jour dans un instant.";

function Notice({ children }: { children: ReactNode }) {
  return (
    <Alert role="group" aria-label="Information">
      <Icon name="schedule" size={20} />
      <div className="flex flex-col items-start gap-3">{children}</div>
    </Alert>
  );
}

function ActionNotice({
  text,
  label,
  onClick,
}: {
  text: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <Notice>
      <p>{text}</p>
      <Button type="button" variant="outline" className="h-11 md:h-9" onClick={onClick}>
        {label}
      </Button>
    </Notice>
  );
}

interface MessagesProps {
  model: FeatureFormModel;
  write: FeatureWrite;
  onClose: () => void;
  onCheckList: () => void;
}

/** Erreur d'enregistrement (table unique §4.7) ou, à défaut, résumé des erreurs de saisie (§4.3). */
function Problem({ model, onClose, onCheckList }: Omit<MessagesProps, "write">) {
  const { state, failureView } = model;
  const criteriaCount = state.values.criteria.length;
  if (failureView) {
    return (
      <SaveErrorAlert
        view={failureView}
        unchangedReloads={state.unchangedReloads}
        criteriaCount={criteriaCount}
        handlers={{
          onRetry: model.save,
          onCheckList,
          onReload: () => void model.reload(),
          onGotoLinks: () => model.focusField("screens"),
          onClose,
          onFocusField: model.focusField,
        }}
      />
    );
  }
  if (model.issues.length === 0 || state.submitted === 0) return null;
  return (
    <FormSummary
      issues={model.issues}
      attempt={state.submitted}
      criteriaCount={criteriaCount}
      onFocusField={model.focusField}
    />
  );
}

/** Messages en tête du formulaire : brouillon repris, conflit, échec ou erreurs, suivi lent, liste en retard. */
export function FormMessages(props: MessagesProps) {
  const { model, write } = props;
  const { state } = model;
  const conflicts = state.conflicts.map((field) => FIELD_LABELS[field]).join(", ");
  return (
    <>
      {state.banner ? (
        <DraftBanner
          banner={state.banner}
          confirming={state.confirming}
          onAsk={model.ask}
          onAbandon={model.abandon}
          onKeepDraft={model.keepDraft}
        />
      ) : null}
      {conflicts && state.current ? (
        <Notice>
          <p>{`Ces champs ont aussi changé dans la spec : ${conflicts}. Vérifiez-les avant d'enregistrer.`}</p>
        </Notice>
      ) : null}
      <Problem model={model} onClose={props.onClose} onCheckList={props.onCheckList} />
      {model.mine && write.slow && write.phase === "tracking" ? (
        <ActionNotice text={SLOW} label="Vérifier maintenant" onClick={write.restart} />
      ) : null}
      {model.mine && write.phase === "late" ? (
        <ActionNotice text={LATE} label="Actualiser la liste" onClick={write.refreshIndex} />
      ) : null}
    </>
  );
}
