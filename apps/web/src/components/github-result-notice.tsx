import { Alert, AlertDescription, AlertTitle, Icon } from "@koklo/ui";
import { type InstallationCallbackOutcome, RESULT_NOTICES } from "../lib/github-labels.ts";

interface ResultNoticeProps {
  outcome: InstallationCallbackOutcome;
}

/** Message de retour de GitHub : `status` pour le succès, `alert` sinon (icône + titre + texte). */
export function GithubResultNotice({ outcome }: ResultNoticeProps) {
  const { title, text, tone } = RESULT_NOTICES[outcome];
  return (
    <Alert {...(tone === "alert" ? { variant: "destructive" as const } : {})}>
      <Icon name={tone === "alert" ? "warning" : "check_circle"} size={20} />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-2">
        <p>{text}</p>
      </AlertDescription>
    </Alert>
  );
}
