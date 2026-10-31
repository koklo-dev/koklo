import type { Role } from "@koklo/contract";
import { Alert, AlertDescription, AlertTitle, Button, Icon } from "@koklo/ui";
import { canReadRepos } from "../lib/roles.ts";
import { type FeatureErrorView, GITHUB_CHECK } from "../lib/spec-errors.ts";
import { SpecIndexFailed } from "./spec-index-failed.tsx";

interface ErrorProps {
  view: FeatureErrorView;
  role: Role | undefined;
  onRetry: () => void;
}

function GithubLink({ view }: { view: FeatureErrorView }) {
  if (!view.githubLink) return view.text ? <p>{view.text}</p> : null;
  if (view.kind === "auth-expired") {
    return (
      <>
        <p>{view.text}</p>
        <a href="/github" className="font-medium underline underline-offset-4">
          Ouvrir la page GitHub
        </a>
      </>
    );
  }
  // Détail indisponible : la consigne « Vérifiez l'état de l'application GitHub » devient le lien.
  const before = view.text.replace(GITHUB_CHECK, "").trim();
  return (
    <p>
      {before}{" "}
      <a href="/github" className="font-medium underline underline-offset-4">
        {GITHUB_CHECK}
      </a>
    </p>
  );
}

/** Erreur de la fiche (§4.11) : une seule alerte, texte du produit, jamais le code technique. */
export function FeatureError({ view, role, onRetry }: ErrorProps) {
  if (view.kind === "index-failed") {
    return (
      <SpecIndexFailed
        errorCode={view.failure?.errorCode ?? null}
        commitSha={view.failure?.commitSha ?? null}
        team={canReadRepos(role)}
        onRefresh={onRetry}
      />
    );
  }
  return (
    <Alert variant="destructive">
      <Icon name="warning" size={20} />
      {view.title ? <AlertTitle>{view.title}</AlertTitle> : null}
      <AlertDescription className="flex flex-col items-start gap-3">
        <GithubLink view={view} />
        {view.retry ? (
          <Button variant="outline" className="h-11 md:h-9" onClick={onRetry}>
            Réessayer
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
