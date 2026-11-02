import { Alert, AlertDescription, Button, Icon } from "@koklo/ui";
import type { FramingModel } from "../lib/use-framing-page.ts";
import { SaveErrorAlert } from "./feature-form-errors.tsx";

/** Échec d'un lot (« tout ou rien ») : rien n'est écrit, la saisie est gardée (S-framing §3.7). */
export function FramingSaveFailure({ page }: { page: FramingModel }) {
  const failure = page.save.failure;
  if (!failure) return null;
  const retry = () => page.patch({ confirming: true });
  const { designated } = failure;
  if (designated) {
    return (
      <Alert variant="destructive">
        <Icon name="warning" size={20} />
        <AlertDescription className="flex flex-col items-start gap-3">
          <p>{`La fonctionnalité n°${designated.position} n'est pas valide : ${designated.message}`}</p>
          <p>Rien n'a été écrit. Corrigez cette proposition puis enregistrez de nouveau.</p>
          <Button type="button" variant="outline" className="h-11 md:h-9" onClick={retry}>
            Réessayer
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  return <SaveErrorAlert view={failure.view} handlers={{ onRetry: retry }} criteriaCount={0} />;
}
