import { Alert, AlertDescription, AlertTitle, Icon } from "@koklo/ui";
import { type InstallationCallbackOutcome, RESULT_NOTICES } from "../lib/github-labels.ts";

interface ResultNoticeProps {
  outcome: InstallationCallbackOutcome;
  /** Nom du projet dont la création attend l'autorisation (marqueur de reprise valide). */
  resumeProjectName?: string | undefined;
}

/** Message de retour de GitHub : `status` pour le succès, `alert` sinon (icône + titre + texte). */
export function GithubResultNotice({ outcome, resumeProjectName }: ResultNoticeProps) {
  const { title, text, tone } = RESULT_NOTICES[outcome];
  return (
    <Alert {...(tone === "alert" ? { variant: "destructive" as const } : {})}>
      <Icon name={tone === "alert" ? "warning" : "check_circle"} size={20} />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-2">
        <p>{text}</p>
        {outcome === "installed" && resumeProjectName ? (
          <a href="/projects" className="font-medium underline underline-offset-4">
            Reprendre la création du projet « {resumeProjectName} »
          </a>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
