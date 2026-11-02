import { Alert, Button, Card, Icon } from "@koklo/ui";
import { useEffect, useRef } from "react";
import { NO_SPEC_TEXT, NOT_READY_TEXT, SPEC_FAILED_TEXT } from "../lib/framing-labels.ts";
import type { SpecGate } from "../lib/use-framing-access.ts";
import type { FramingModel } from "../lib/use-framing-page.ts";

/** Rôle sans droit d'écriture (client, business, rôle inconnu) : page sobre, ni formulaire ni appel (S-framing §4.12). */
export function FramingForbidden({ projectId }: { projectId: string }) {
  return (
    <Card className="flex flex-col items-center gap-2 p-8 text-center">
      <Icon name="lock" size={28} className="text-muted-foreground" />
      <h2 className="text-base font-semibold tracking-[-0.015em]">
        Le cadrage assisté n'est pas disponible pour votre rôle.
      </h2>
      <Button asChild variant="outline" className="h-11 md:h-9">
        <a href={`/projects/${projectId}/features`}>Voir les fonctionnalités du projet</a>
      </Button>
    </Card>
  );
}

const SPEC_TEXT: Record<Exclude<SpecGate["kind"], "ready">, string> = {
  building: NOT_READY_TEXT,
  unknown: NOT_READY_TEXT,
  failed: SPEC_FAILED_TEXT,
  missing: NO_SPEC_TEXT,
};

/** Spec pas prête : la page reste utilisable, seul l'enregistrement est bloqué (S-framing §4.10). */
export function SpecNotice({ page }: { page: FramingModel }) {
  const { spec } = page.access;
  if (spec.kind === "ready") return null;
  const action =
    spec.kind === "missing" ? (
      <Button asChild variant="outline" className="h-11 md:h-9">
        <a href={`/projects/${page.projectId}/features`}>Voir les fonctionnalités</a>
      </Button>
    ) : (
      <Button type="button" variant="outline" className="h-11 md:h-9" onClick={page.access.refresh}>
        Actualiser
      </Button>
    );
  return (
    <Alert role="note">
      <Icon name="schedule" size={20} />
      <div className="flex flex-col items-start gap-2">
        <p>{SPEC_TEXT[spec.kind]}</p>
        {action}
      </div>
    </Alert>
  );
}

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

function AbandonConfirm({ page }: { page: FramingModel }) {
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => keep.current?.focus(), []);
  return (
    <>
      <p>Abandonner ce brouillon ?</p>
      <div className="flex flex-col gap-2 md:flex-row">
        <Button
          type="button"
          variant="destructive"
          className="h-11 md:h-9"
          onClick={() => {
            page.discard();
            page.patch({
              abandoning: false,
              ideaCollapsed: false,
              answering: false,
              emptyResult: false,
              notice: "",
            });
          }}
        >
          Abandonner
        </Button>
        <Button
          ref={keep}
          type="button"
          variant="outline"
          className="h-11 md:h-9"
          onClick={() => page.patch({ abandoning: false })}
        >
          Garder
        </Button>
      </div>
    </>
  );
}

/** Brouillon repris (S-framing §4.13) : bandeau neutre, abandon confirmé en ligne. */
export function FramingDraftBanner({ page }: { page: FramingModel }) {
  if (!page.restored) return null;
  return (
    <Alert role="group" aria-label="Brouillon">
      <Icon name="edit_note" size={20} />
      <div className="flex flex-col items-start gap-3">
        {page.view.abandoning ? (
          <AbandonConfirm page={page} />
        ) : (
          <>
            <p>{`Brouillon de cadrage repris (${formatDate(page.restored)}).`}</p>
            <Button
              type="button"
              variant="outline"
              className="h-11 md:h-9"
              onClick={() => page.patch({ abandoning: true })}
            >
              Abandonner
            </Button>
          </>
        )}
      </div>
    </Alert>
  );
}
