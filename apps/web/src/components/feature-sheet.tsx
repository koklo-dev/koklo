"use client";

import type { FeatureSummary, Role } from "@koklo/contract";
import { Button, IdTag, ValidationStatus } from "@koklo/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { validationStatus } from "../lib/feature-labels.ts";
import { orpc } from "../lib/orpc.ts";
import { canReadRepos } from "../lib/roles.ts";
import { describeFeatureError } from "../lib/spec-errors.ts";
import { useUnauthorizedRedirect } from "../lib/use-unauthorized-redirect.ts";
import { FeatureDetail } from "./feature-detail.tsx";
import { FeatureError } from "./feature-error.tsx";
import { FeatureLifecycle } from "./feature-status.tsx";
import { LoadingStatus } from "./loading-status.tsx";

interface SheetProps {
  projectId: string;
  specId: string;
  /** Ligne de la liste : en-tête immédiat avant l'arrivée du détail. */
  summary: FeatureSummary | undefined;
  role: Role | undefined;
  /** La fonctionnalité a disparu de la spec : la liste est relue en arrière-plan. */
  onGone: () => void;
  /** « Modifier » : présent seulement pour l'équipe qui écrit, quand la spec est lue. */
  onEdit: (() => void) | undefined;
}

function Body({
  query,
  role,
}: {
  query: ReturnType<typeof useFeatureQuery>;
  role: Role | undefined;
}) {
  if (query.data) return <FeatureDetail detail={query.data} team={canReadRepos(role)} />;
  if (query.isError) {
    return (
      <FeatureError
        view={describeFeatureError(query.error, role)}
        role={role}
        onRetry={() => void query.refetch()}
      />
    );
  }
  return <LoadingStatus label="Chargement de la fiche…" rows={3} rowClassName="h-16" />;
}

function useFeatureQuery(projectId: string, specId: string) {
  return useQuery(orpc.spec.getFeature.queryOptions({ input: { projectId, specId } }));
}

/**
 * Fiche d'une fonctionnalité, contenu de la région ancrée de `SpecCollection` (maquette 10 l.199-221) : identifiant,
 * validation et « Modifier », titre, avancement, puis le détail de `spec.getFeature`. L'en-tête vient de la ligne de
 * la liste. Le focus initial va au titre (on lit d'abord).
 */
export function FeatureSheet({ projectId, specId, summary, role, onGone, onEdit }: SheetProps) {
  const query = useFeatureQuery(projectId, specId);
  const title = useRef<HTMLHeadingElement>(null);
  useUnauthorizedRedirect(query.error);
  const gone = query.isError && describeFeatureError(query.error, role).kind === "not-found";
  useEffect(() => {
    if (gone) onGone();
  }, [gone, onGone]);
  useEffect(() => title.current?.focus(), []);

  const shown = summary ?? query.data;
  const criteriaCount = summary?.criteriaCount ?? query.data?.criteria.length ?? 0;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <IdTag>{specId}</IdTag>
        {summary ? <ValidationStatus status={validationStatus(summary.validation)} /> : null}
        <span className="flex-1" />
        {onEdit ? (
          <Button variant="outline" size="sm" className="max-md:h-11" onClick={onEdit}>
            Modifier
          </Button>
        ) : null}
      </div>
      <h2 ref={title} tabIndex={-1} className="text-settings-title outline-none">
        {shown?.title ?? specId}
      </h2>
      {shown ? (
        <FeatureLifecycle
          className="self-start"
          feature={{ status: shown.status, criteriaCount }}
        />
      ) : null}
      <Body query={query} role={role} />
    </>
  );
}
