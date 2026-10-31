import { Alert, AlertDescription, AlertTitle, Icon } from "@koklo/ui";
import type { StartFailure } from "../lib/github-start-error.ts";
import type { SpecRepoErrorView } from "../lib/spec-repo-errors.ts";

export const PARTIAL_TITLE = "Projet créé, dépôt de spec non créé";

interface FailureProps {
  view: SpecRepoErrorView;
  /** Échec de « Autoriser Koklo » (installation.start), rendu dans la même alerte. */
  authFailure: StartFailure | undefined;
}

/** Alerte de l'échec partiel : le projet est enregistré, seul le dépôt manque (une seule alerte à la fois). */
export function SpecRepoFailure({ view, authFailure }: FailureProps) {
  return (
    <Alert variant="destructive">
      <Icon name="warning" size={20} />
      <AlertTitle>{PARTIAL_TITLE}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <p>{view.text}</p>
        {view.githubLink ? (
          <a href="/github" className="font-medium underline underline-offset-4">
            Ouvrir la page GitHub
          </a>
        ) : null}
        {authFailure ? (
          <div className="flex flex-col gap-1">
            {authFailure.title ? <p className="font-medium">{authFailure.title}</p> : null}
            <p>{authFailure.text}</p>
          </div>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
