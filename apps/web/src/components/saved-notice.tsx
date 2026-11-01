"use client";

import type { Role } from "@koklo/contract";
import { Alert, Button, Icon } from "@koklo/ui";
import { describeSaveError } from "../lib/feature-errors.ts";
import { canReadRepos } from "../lib/roles.ts";
import type { FeatureWrite, WriteMeta } from "../lib/use-feature-submit.ts";
import type { Placement } from "../lib/use-index-wait.ts";
import { SaveErrorAlert } from "./feature-form-errors.tsx";
import { WaitNotice } from "./write-wait-notice.tsx";

const PLACEMENT_TEXT: Partial<Record<Placement, string>> = {
  filtered: "Elle n'apparaît pas avec les filtres actuels.",
  more: "Utilisez « Afficher plus de fonctionnalités » pour la voir.",
};

interface NoticeProps {
  write: FeatureWrite;
  role: Role | undefined;
  hrefFor: (specId: string) => string;
  onOpen: (specId: string) => void;
}

/** « F-001 supprimée. » (sans titre) ou « F-004 « Titre » créée. » / « … enregistrée. » ; phrase propre si l'index a échoué. */
function confirmationText(meta: WriteMeta, indexFailed: boolean): string {
  if (indexFailed)
    return "Votre modification a été enregistrée, mais la spec n'a pas pu être relue.";
  if (meta.kind === "delete") return `${meta.specId} supprimée.`;
  return `${meta.specId} « ${meta.title} » ${meta.kind === "create" ? "créée" : "enregistrée"}.`;
}

function Confirmation({ write, role, hrefFor, onOpen }: NoticeProps) {
  const saved = write.saved;
  if (!saved) return null;
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
  return (
    <SaveErrorAlert view={view} handlers={{}} criteriaCount={0}>
      <Button type="button" variant="outline" className="h-11 md:h-9" onClick={onReopen}>
        Rouvrir le brouillon
      </Button>
    </SaveErrorAlert>
  );
}
