"use client";

import { InlineAlert } from "@koklo/ui";
import { useEffect, useRef } from "react";
import type { FreezeState } from "../lib/use-idea-freeze.ts";
import type { IdeaModel } from "../lib/use-idea-page.ts";

/**
 * Confirmation en ligne des questions ouvertes (B262) : le focus arrive sur « Revoir les questions », l'option sûre ;
 * Échap annule et rend le focus au bouton « Passer au cadrage ».
 */
export function IdeaFreezeConfirm({
  openQuestions,
  onConfirm,
  onReview,
  onCancel,
}: {
  openQuestions: number;
  onConfirm: () => void;
  onReview: () => void;
  onCancel: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      box.current?.querySelector<HTMLButtonElement>("button")?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, []);
  const many = openQuestions > 1;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Échap ferme la confirmation, le focus est dans ses boutons
    <div
      ref={box}
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel();
      }}
    >
      <InlineAlert
        variant="warning"
        icon="warning"
        actions={[
          { label: "Revoir les questions", onClick: onReview },
          { label: "Passer quand même", onClick: onConfirm },
        ]}
      >
        Il reste {openQuestions} {many ? "questions ouvertes" : "question ouverte"} dans Hypothèses
        et risques. Passer au cadrage quand même ?
      </InlineAlert>
    </div>
  );
}

export interface FramingActions {
  confirm: () => void;
  review: () => void;
  cancel: () => void;
  retry: () => void;
  refreeze: () => void;
}

function FreezeNotice({
  model,
  freeze,
  actions,
}: {
  model: IdeaModel;
  freeze: FreezeState;
  actions: FramingActions;
}) {
  if (freeze.kind === "confirm") {
    return (
      <IdeaFreezeConfirm
        openQuestions={model.maturity.openQuestions}
        onConfirm={actions.confirm}
        onReview={actions.review}
        onCancel={actions.cancel}
      />
    );
  }
  if (freeze.kind === "freezing") {
    return (
      <div role="status">
        <InlineAlert variant="neutral" icon="info">
          Passage au cadrage…
        </InlineAlert>
      </div>
    );
  }
  if (freeze.kind === "slow") {
    return (
      <InlineAlert variant="neutral" icon="info">
        Le passage au cadrage continue en arrière-plan. Vous pouvez poursuivre.
      </InlineAlert>
    );
  }
  if (freeze.kind === "failed") {
    return (
      <InlineAlert
        variant="error"
        icon="error"
        action={{ label: "Réessayer", onClick: actions.retry }}
      >
        Le passage au cadrage a échoué. Vos pages sont gardées.
      </InlineAlert>
    );
  }
  return null;
}

/**
 * Bandeaux du passage : confirmation, en cours, lent, échec ; sinon « Modifié depuis idea-vN » (information pour tous,
 * « Figer une nouvelle version » pour l'équipe seulement).
 */
export function IdeaFramingNotices({
  model,
  freeze,
  actions,
}: {
  model: IdeaModel;
  freeze: FreezeState;
  actions: FramingActions;
}) {
  const { latest, modifiedSince } = model.version;
  return (
    <>
      <FreezeNotice model={model} freeze={freeze} actions={actions} />
      {latest && modifiedSince && freeze.kind === "idle" ? (
        <InlineAlert
          variant="neutral"
          icon="info"
          action={
            model.canFreeze
              ? { label: "Figer une nouvelle version", onClick: actions.refreeze }
              : undefined
          }
        >
          Modifié depuis {latest.tag}
        </InlineAlert>
      ) : null}
    </>
  );
}
