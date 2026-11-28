"use client";

import type { Role } from "@koklo/contract";
import { Alert, Button, Icon } from "@koklo/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { describeSaveError } from "../lib/feature-errors.ts";
import { LATE_POLL_MS } from "../lib/feature-tracking.ts";
import { confirmationText, PLACEMENT_TEXT } from "../lib/features-region.ts";
import { orpc } from "../lib/orpc.ts";
import { canReadRepos } from "../lib/roles.ts";
import type { FeatureWrite } from "../lib/use-feature-submit.ts";
import { SaveErrorAlert } from "./feature-form-errors.tsx";
import { WaitNotice } from "./write-wait-notice.tsx";

interface NoticeProps {
  write: FeatureWrite;
  role: Role | undefined;
  hrefFor: (specId: string) => string;
  onOpen: (specId: string) => void;
}

function Confirmation({ write, role, hrefFor, onOpen }: NoticeProps) {
  const saved = write.saved;
  if (!saved || saved.meta.inPlace) return null;
  const { meta, indexFailed, placement } = saved;
  const short = saved.commitSha?.slice(0, 7);
  const text = confirmationText(meta, indexFailed);
  return (
    <Alert role="group" aria-label="Enregistrement terminé" className="mt-2">
      <Icon name="check_circle" size={20} />
      <div className="flex flex-col items-start gap-2">
        <p>{text}</p>
        {placement && PLACEMENT_TEXT[placement] ? <p>{PLACEMENT_TEXT[placement]}</p> : null}
        {short && canReadRepos(role) ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Icon name="commit" size={16} />
            <span>Version de la spec</span>
            <span role="img" aria-label={`Version de la spec ${short}`} className="font-mono">
              {short}
            </span>
          </p>
        ) : null}
        <div className="flex flex-col gap-2 md:flex-row">
          {indexFailed || !meta.specId || meta.kind === "delete" ? null : (
            <Button asChild variant="outline" className="h-11 md:h-9">
              <a
                href={hrefFor(meta.specId)}
                onClick={(event) => {
                  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey)
                    return;
                  event.preventDefault();
                  onOpen(meta.specId as string);
                }}
              >
                Voir la fiche
              </a>
            </Button>
          )}
          <Button type="button" variant="outline" className="h-11 md:h-9" onClick={write.dismiss}>
            Fermer
          </Button>
        </div>
      </div>
    </Alert>
  );
}

/** Contenu de la région d'état de la page quand le formulaire est fermé : suivi lent, liste en retard, confirmation. */
export function WriteNotice(props: NoticeProps) {
  const { write } = props;
  if (write.phase === "saved") return <Confirmation {...props} />;
  const slow = write.phase === "tracking" && write.slow;
  if (!slow && write.phase !== "late") return null;
  return (
    <WaitNotice
      write={write}
      slow={slow}
      label="Enregistrement en cours"
      dismissible
      className="mt-2"
    />
  );
}

/** Échec arrivé formulaire fermé : alerte au-dessus du tableau avec « Rouvrir le brouillon ». */
export function WriteFailure({
  write,
  role,
  onReopen,
}: {
  write: FeatureWrite;
  role: Role | undefined;
  onReopen: () => void;
}) {
  if (write.phase !== "failed" || !write.failure) return null;
  const view = describeSaveError(write.failure, {
    role,
    mode: write.meta?.kind ?? "update",
  });
  const outdated = view.kind === "stale-base" || view.kind === "write-conflict";
  const direct = Boolean(write.meta?.direct || write.meta?.inPlace);
  return (
    <>
      {outdated ? <HeadRefresh projectId={write.projectId} /> : null}
      {direct ? (
        <DirectFailure view={view} outdated={outdated} onDismiss={write.dismiss} />
      ) : (
        <SaveErrorAlert view={view} handlers={{}} criteriaCount={0}>
          <Button type="button" variant="outline" className="h-11 md:h-9" onClick={onReopen}>
            Rouvrir le brouillon
          </Button>
        </SaveErrorAlert>
      )}
    </>
  );
}

/**
 * Écriture refusée parce que la spec a avancé (TK-115c) : tant que l'avis est affiché, `spec.head` est relu. Les listes
 * suivent la nouvelle version, et l'envoi suivant part avec elle.
 */
function HeadRefresh({ projectId }: { projectId: string }) {
  useQuery({
    ...orpc.spec.head.queryOptions({ input: { projectId } }),
    refetchInterval: LATE_POLL_MS,
  });
  return null;
}

const OUTDATED_DIRECT = {
  title: "La spec a changé depuis l'affichage de cette page",
  text: "Rien n'a été écrit. La version actuelle est relue : recommencez votre action.",
};

/** Échec d'une action sur place : aucun brouillon ; « Recharger » relit la spec, sinon « Fermer ». */
function DirectFailure({
  view,
  outdated,
  onDismiss,
}: {
  view: ReturnType<typeof describeSaveError>;
  outdated: boolean;
  onDismiss: () => void;
}) {
  const queryClient = useQueryClient();
  const reload = (): void => {
    void queryClient.invalidateQueries({ queryKey: orpc.spec.key() });
    onDismiss();
  };
  return (
    <SaveErrorAlert
      view={outdated ? { ...view, ...OUTDATED_DIRECT } : view}
      handlers={{}}
      criteriaCount={0}
    >
      <Button
        type="button"
        variant="outline"
        className="h-11 md:h-9"
        onClick={outdated ? reload : onDismiss}
      >
        {outdated ? "Recharger" : "Fermer"}
      </Button>
    </SaveErrorAlert>
  );
}
