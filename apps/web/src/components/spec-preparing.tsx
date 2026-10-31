import { Button, Card, Icon } from "@koklo/ui";
import { useEffect, useRef } from "react";

const PREPARING_TEXT =
  "Koklo lit le dépôt de spec de ce projet. Les fonctionnalités s'afficheront dès que la lecture sera terminée.";
const SLOW_TEXT = "La préparation prend plus de temps que prévu. Actualisez dans un moment.";
const NEUTRAL_TEXT =
  "La spec de ce projet n'est pas encore disponible. Revenez plus tard ou demandez à l'équipe où en est la préparation.";

interface PreparingProps {
  /** Rôle sans détail (client, business) ou lecture des dépôts impossible : on n'affirme rien. */
  neutral: boolean;
  /** L'actualisation automatique de 2 minutes est terminée. */
  expired: boolean;
  /** Relit `repo.list` (son échec) au lieu de `spec.head`. */
  retryRepos: boolean;
  onRefresh: () => void;
  /** Le dépôt vient d'être créé : le focus passe au titre de la carte (le bouton déclencheur a disparu). */
  focusTitle: boolean;
}

/** Spec en préparation (§4.5) ou indisponible sans détail (§4.7) ; l'actualisation automatique est bornée. */
export function SpecPreparing({
  neutral,
  expired,
  retryRepos,
  onRefresh,
  focusTitle,
}: PreparingProps) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusTitle) title.current?.focus();
  }, [focusTitle]);
  let text = NEUTRAL_TEXT;
  if (!neutral) text = expired ? SLOW_TEXT : PREPARING_TEXT;
  return (
    <Card className="flex flex-col items-center gap-2 p-8 text-center">
      <Icon name="schedule" size={28} className="text-muted-foreground" />
      <h2
        ref={title}
        tabIndex={-1}
        className="text-base font-semibold tracking-[-0.015em] outline-none"
      >
        {neutral
          ? "Aucune fonctionnalité à afficher pour le moment"
          : "La spec est en cours de préparation"}
      </h2>
      <p className="text-[13px] text-muted-foreground">{text}</p>
      <Button variant="outline" className="h-11 md:h-9" onClick={onRefresh}>
        {retryRepos ? "Réessayer" : "Actualiser"}
      </Button>
    </Card>
  );
}
