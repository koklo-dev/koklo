import { Alert, AlertDescription, AlertTitle, Button, Icon } from "@koklo/ui";
import type { Ref } from "react";
import type { PendingResume } from "../lib/creation-types.ts";

interface NoticeProps {
  pending: PendingResume;
  /** `openLink` : rouvrir directement le repli « Relier un dépôt existant ». */
  onResume: (openLink: boolean) => void;
  onIgnore: () => void;
  resumeRef: Ref<HTMLButtonElement>;
}

/** Notice de page : le projet existe, son dépôt de spec n'a pas été créé (design/screens/S-projects.md §5.2). */
export function SpecRepoResumeNotice({ pending, onResume, onIgnore, resumeRef }: NoticeProps) {
  return (
    <Alert variant="destructive" className="mb-3">
      <Icon name="warning" size={20} />
      <AlertTitle>Projet « {pending.marker.projectName} » : dépôt de spec non créé</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <p>Le projet existe, mais son dépôt de spec n'a pas encore été créé.</p>
        <div className="flex flex-wrap gap-2">
          <Button ref={resumeRef} className="h-11 md:h-9" onClick={() => onResume(false)}>
            Reprendre
          </Button>
          {pending.offerLink ? (
            <Button variant="outline" className="h-11 md:h-9" onClick={() => onResume(true)}>
              Relier un dépôt existant
            </Button>
          ) : null}
          <Button variant="outline" className="h-11 md:h-9" onClick={onIgnore}>
            Ignorer
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
