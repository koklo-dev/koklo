import { Alert, AlertDescription, AlertTitle, Button, Icon } from "@koklo/ui";
import { describeIndexFailure } from "../lib/spec-errors.ts";

interface IndexFailedProps {
  errorCode: string | null;
  commitSha: string | null;
  /** Vue équipe : consigne de correction et ligne technique ; sinon un texte sans vocabulaire technique. */
  team: boolean;
  onRefresh: () => void;
}

function technicalLine(errorCode: string | null, commitSha: string | null): string {
  return [
    errorCode ? `Code : ${errorCode}` : null,
    commitSha ? `version ${commitSha.slice(0, 7)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** La spec n'a pas pu être lue (index en échec) : alerte destructive, icône + titre + texte (§4.8). */
export function SpecIndexFailed({ errorCode, commitSha, team, onRefresh }: IndexFailedProps) {
  const technical = team ? technicalLine(errorCode, commitSha) : "";
  return (
    <Alert variant="destructive">
      <Icon name="warning" size={20} />
      <AlertTitle>La spec n'a pas pu être lue</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <p>{describeIndexFailure(errorCode)}</p>
        <p>
          {team
            ? "Corrigez la spec puis poussez la correction : la lecture reprendra seule."
            : "Prévenez l'équipe : la spec doit être corrigée."}
        </p>
        {technical ? <p className="font-mono text-xs">{technical}</p> : null}
        <Button variant="outline" className="h-11 md:h-9" onClick={onRefresh}>
          Actualiser
        </Button>
      </AlertDescription>
    </Alert>
  );
}
