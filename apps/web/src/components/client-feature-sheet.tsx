"use client";

import {
  EntityChip,
  Icon,
  IdTag,
  ReviewComment,
  Skeleton,
  ValidationPrompt,
  ValidationStatus,
} from "@koklo/ui";
import { type RefObject, useEffect } from "react";
import { criterionSentence, linkKind } from "../lib/client-criteria.ts";
import { validationOf } from "../lib/client-validation-labels.ts";
import { useChangeRequest, useClientFeature } from "../lib/use-client-space.ts";
import type { ReviewActions } from "./client-decision.tsx";
import { ErrorNotice } from "./error-notice.tsx";

const DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

interface SheetProps {
  projectId: string;
  featureId: string;
  canValidate: boolean;
  clientName: string;
  actions: ReviewActions;
  titleRef: RefObject<HTMLHeadingElement | null>;
  /** Le titre prend le focus dès que la fiche est lue. */
  focusTitle: boolean;
  onFocused: () => void;
  /** Décision enregistrée : l'onglet passe à la suivante non traitée. */
  onDecided: (verb: string) => void;
}

/** Fiche client d'une fonctionnalité (maquette 10 l.198-221) : sans jauge, sans pied technique, sans « Modifier ». */
export function ClientFeatureSheet({
  projectId,
  featureId,
  canValidate,
  clientName,
  actions,
  titleRef,
  focusTitle,
  onFocused,
  onDecided,
}: SheetProps) {
  const query = useClientFeature(projectId, featureId);
  const feature = query.data;
  const loadedId = feature?.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: le focus se pose une fois la fiche choisie lue
  useEffect(() => {
    if (!focusTitle || !loadedId) return;
    titleRef.current?.focus();
    onFocused();
  }, [focusTitle, loadedId]);
  const request = useChangeRequest(projectId, featureId, feature?.validation === "to_revise");
  if (query.isError) {
    return (
      <ErrorNotice
        title="Impossible de charger la fonctionnalité"
        onRetry={() => void query.refetch()}
      >
        La fiche n'a pas pu être lue.
      </ErrorNotice>
    );
  }
  if (!feature) return <Skeleton aria-busy="true" className="h-64 rounded-xl" />;
  const target = {
    targetKind: "feature",
    targetRef: feature.id,
    version: feature.version,
  } as const;
  const decide = async (status: "approved" | "changes_requested", comment?: string) => {
    const done = await actions.decide({ ...target, status, ...(comment ? { comment } : {}) });
    if (done) onDecided(status === "approved" ? "Validée" : "Changement demandé");
  };
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <IdTag>{feature.id}</IdTag>
        <ValidationStatus status={validationOf(feature.validation)} />
      </div>
      <h2 ref={titleRef} tabIndex={-1} className="text-section-title outline-none">
        {feature.title}
      </h2>
      <p className="text-body">{feature.description}</p>
      <h3 className="text-subsection-title">Ce qui doit se passer</h3>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {feature.criteria.map((criterion) => (
          <li key={criterion.id} className="flex gap-2.5 text-body">
            <Icon name="check" size={18} className="mt-0.5 shrink-0 text-muted-foreground" />
            <span>{criterionSentence(criterion.steps)}</span>
          </li>
        ))}
      </ol>
      {feature.links.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
            En lien avec
          </span>
          <div className="flex flex-wrap gap-1.5">
            {feature.links.map((link) => (
              <EntityChip key={link.id} kind={linkKind(link.id)} id={link.id} title={link.label} />
            ))}
          </div>
        </div>
      ) : null}
      {request ? <ReviewComment name={clientName}>{request}</ReviewComment> : null}
      {canValidate && feature.validation !== "validated" && feature.validation !== "to_revise" ? (
        <ValidationPrompt
          key={feature.id}
          variant="inline"
          validateLabel="Valider"
          placeholder="Décrivez ce qui ne correspond pas à votre besoin"
          pending={actions.pending}
          error={actions.errorFor("feature", feature.id)}
          note={
            <>
              Votre validation porte sur la version du{" "}
              <span className="font-mono">
                {DATE.format(new Date(feature.versionNote.date))} · {feature.versionNote.label}
              </span>
              . Si l'équipe modifie ensuite la fonctionnalité, elle vous sera re-présentée.
            </>
          }
          onValidate={() => void decide("approved")}
          onRequestChange={(comment) => void decide("changes_requested", comment)}
        />
      ) : null}
    </>
  );
}
