"use client";

import type { FeatureSummary, Role } from "@koklo/contract";
import { Button, Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@koklo/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { orpc } from "../lib/orpc.ts";
import { canReadRepos } from "../lib/roles.ts";
import { describeFeatureError } from "../lib/spec-errors.ts";
import { useUnauthorizedRedirect } from "../lib/use-unauthorized-redirect.ts";
import { FeatureDetail } from "./feature-detail.tsx";
import { FeatureError } from "./feature-error.tsx";
import { PriorityText, StatusBadge } from "./features-list.tsx";
import { LoadingStatus } from "./loading-status.tsx";

interface SheetProps {
  projectId: string;
  specId: string;
  /** Ligne de la liste : en-tête immédiat avant l'arrivée du détail. */
  summary: FeatureSummary | undefined;
  role: Role | undefined;
  onClose: () => void;
  /** La fonctionnalité a disparu de la spec : la liste est relue en arrière-plan. */
  onGone: () => void;
  /** Rend le focus au lien de la ligne d'origine (ou au titre de la page). */
  onReturnFocus: (specId: string) => void;
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
 * Fiche d'une fonctionnalité (`Sheet` modal). L'en-tête vient de la ligne de la liste, le détail de
 * `spec.getFeature`. Le focus initial va au titre (on lit d'abord), la fermeture le rend au lien d'origine.
 */
export function FeatureSheet({
  projectId,
  specId,
  summary,
  role,
  onClose,
  onGone,
  onReturnFocus,
}: SheetProps) {
  const query = useFeatureQuery(projectId, specId);
  const title = useRef<HTMLHeadingElement>(null);
  useUnauthorizedRedirect(query.error);
  const gone = query.isError && describeFeatureError(query.error, role).kind === "not-found";
  useEffect(() => {
    if (gone) onGone();
  }, [gone, onGone]);

  const shown = summary ?? query.data;
  return (
    <Sheet open onOpenChange={(open) => open || onClose()}>
      <SheetContent
        aria-describedby={undefined}
        closeLabel="Fermer la fiche"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          title.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onReturnFocus(specId);
        }}
      >
        <SheetHeader>
          <span className="font-mono text-xs text-muted-foreground">{specId}</span>
          <SheetTitle
            ref={title}
            tabIndex={-1}
            className="text-xl font-semibold tracking-[-0.015em] outline-none"
          >
            {shown?.title ?? specId}
          </SheetTitle>
          {shown ? (
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={shown.status} />
              <span className="text-[13px]">
                <PriorityText priority={shown.priority} />
              </span>
            </div>
          ) : null}
        </SheetHeader>
        {/* Région défilante atteignable au clavier (axe `scrollable-region-focusable`) : Tab puis flèches. */}
        <section
          aria-label="Détail de la fonctionnalité"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: région défilante, doit pouvoir être lue au clavier
          tabIndex={0}
          className="flex-1 overflow-y-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Body query={query} role={role} />
        </section>
        <SheetFooter>
          <Button variant="outline" className="h-11 md:h-9" onClick={onClose}>
            Fermer
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
