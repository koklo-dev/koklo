import { Alert, Button, Icon } from "@koklo/ui";
import { LATE_TEXT, SLOW_TEXT } from "../lib/features-region.ts";
import type { FeatureWrite } from "../lib/use-feature-submit.ts";

interface WaitNoticeProps {
  write: FeatureWrite;
  /** Suivi lent (« Vérifier maintenant ») ou liste en retard (« Actualiser la liste »). */
  slow: boolean;
  /** Nom du groupe : le bloc de la page et celui du panneau se distinguent. */
  label: string;
  /** Page seulement : « Fermer » efface l'avis de liste en retard. */
  dismissible?: boolean;
  className?: string;
}

/** Avis neutre d'attente (jamais une erreur) : l'écriture continue sans la page ou l'index n'a pas rattrapé. */
export function WaitNotice({ write, slow, label, dismissible, className }: WaitNoticeProps) {
  return (
    <Alert role="group" aria-label={label} className={className}>
      <Icon name="schedule" size={20} />
      <div className="flex flex-col items-start gap-3">
        <p>{slow ? SLOW_TEXT : LATE_TEXT}</p>
        <div className="flex flex-col gap-2 md:flex-row">
          <Button
            type="button"
            variant="outline"
            className="h-11 md:h-9"
            onClick={slow ? write.restart : write.refreshIndex}
          >
            {slow ? "Vérifier maintenant" : "Actualiser la liste"}
          </Button>
          {dismissible && !slow ? (
            <Button type="button" variant="outline" className="h-11 md:h-9" onClick={write.dismiss}>
              Fermer
            </Button>
          ) : null}
        </div>
      </div>
    </Alert>
  );
}
