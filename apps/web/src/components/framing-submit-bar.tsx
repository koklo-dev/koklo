import { Alert, Button, Icon } from "@koklo/ui";
import { useEffect, useRef } from "react";
import { criteriaLabel, priorityLabel } from "../lib/feature-labels.ts";
import { plural } from "../lib/features-region.ts";
import { DESIGNER_TEXT } from "../lib/framing-labels.ts";
import type { FramingModel } from "../lib/use-framing-page.ts";
import { AiSendPolicy } from "./ai-send-policy.tsx";

const SAVE_ID = "framing-save";

/** Le designer lit et décide ici, mais n'enregistre que depuis le formulaire (S-framing §4.11) : message permanent. */
function DesignerNotice({ projectId }: { projectId: string }) {
  return (
    <Alert role="note">
      <Icon name="lock" size={20} />
      <div className="flex flex-col items-start gap-2">
        <p>{DESIGNER_TEXT}</p>
        <Button asChild variant="outline" className="h-11 md:h-9">
          <a href={`/projects/${projectId}/features`}>Ouvrir les fonctionnalités</a>
        </Button>
      </div>
    </Alert>
  );
}

/** Récapitulatif en ligne : jamais de modale, focus sur « Revenir », Échap = « Revenir ». */
function ConfirmPanel({ page }: { page: FramingModel }) {
  const { proposals, access, save, patch, focusOn } = page;
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => back.current?.focus(), []);
  const close = () => {
    patch({ confirming: false });
    focusOn(SAVE_ID);
  };
  const where = access.projectName ? `dans le projet ${access.projectName}` : "dans ce projet";
  return (
    // biome-ignore lint/a11y/useSemanticElements: groupe nommé, le récapitulatif n'est ni un fieldset ni une modale
    <div
      role="group"
      aria-label="Confirmer l'enregistrement"
      data-slot="framing-confirm"
      className="flex flex-col gap-3 rounded-lg border bg-card p-4 text-card-foreground"
      onKeyDown={(event) => {
        if (event.key === "Escape") close();
      }}
    >
      <p className="font-medium">{`Vous allez créer ${plural(proposals.accepted.length, "fonctionnalité")} ${where} :`}</p>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
        {proposals.accepted.map((proposal) => (
          <li key={proposal.id} className="break-words">
            {`${proposal.value.title} (${priorityLabel(proposal.value.priority)}, ${criteriaLabel(proposal.value.criteria.length)})`}
          </li>
        ))}
      </ul>
      <p className="text-[13px] text-muted-foreground">
        Les propositions rejetées ou à relire ne sont pas enregistrées.
      </p>
      <div className="flex flex-col gap-2 md:flex-row">
        <Button type="button" className="h-11 md:h-9" onClick={save.submit}>
          Confirmer
        </Button>
        <Button ref={back} type="button" variant="outline" className="h-11 md:h-9" onClick={close}>
          Revenir
        </Button>
      </div>
    </div>
  );
}

/**
 * Barre d'enregistrement (S-framing §3.5) : collante en bas sur mobile, en bas de la liste sur grand écran.
 * Le bouton n'existe qu'avec au moins une acceptée valide ; jamais de bouton grisé muet.
 */
export function FramingSubmitBar({ page }: { page: FramingModel }) {
  const { proposals, save, view, patch, projectId } = page;
  if (save.block === "designer") return <DesignerNotice projectId={projectId} />;
  if (view.confirming && !save.block) return <ConfirmPanel page={page} />;
  const count = proposals.accepted.length;
  return (
    <div
      data-slot="framing-save-bar"
      className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-3 border-t bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:static md:mx-0 md:border-t-0 md:px-0"
    >
      <AiSendPolicy variant="reminder" />
      {save.block ? null : count > 0 ? (
        <Button
          id={SAVE_ID}
          type="button"
          className="h-11 w-full md:h-9 md:w-auto md:self-start"
          disabled={save.busy}
          onClick={() => patch({ confirming: true })}
        >
          <Icon name="add" size={20} />
          {`Enregistrer ${plural(count, "fonctionnalité")}`}
        </Button>
      ) : (
        <p className="text-sm">Acceptez au moins une proposition pour continuer.</p>
      )}
    </div>
  );
}
