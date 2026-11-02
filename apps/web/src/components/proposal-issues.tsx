import { Alert, Icon } from "@koklo/ui";
import type { FormIssue } from "../lib/feature-form.ts";
import { proposalFieldId } from "../lib/framing-ids.ts";

const LABELS = { title: "Titre", description: "Description", priority: "Priorité" } as const;

/** Nom court du champ d'une erreur : « Titre », « Critère 2 », « Critère 1, étape 3 ». */
function labelOf(field: string): string {
  if (field in LABELS) return LABELS[field as keyof typeof LABELS];
  const [, criterion, , step] = field.split(".");
  return step ? `Critère ${criterion}, étape ${step}` : `Critère ${criterion}`;
}

/** Résumé des erreurs d'une proposition : un vrai lien par erreur, qui place le focus sur le champ. */
export function ProposalIssues({
  proposalId,
  issues,
}: {
  proposalId: string;
  issues: FormIssue[];
}) {
  if (issues.length === 0) return null;
  return (
    <Alert variant="destructive" role="group" aria-label="Erreurs de la proposition">
      <Icon name="warning" size={20} />
      <ul className="flex list-none flex-col gap-1">
        {issues.map((issue) => {
          const id = proposalFieldId(proposalId, issue.field);
          return (
            <li key={issue.field}>
              <a
                href={`#${id}`}
                className="underline underline-offset-4"
                onClick={(event) => {
                  event.preventDefault();
                  document.getElementById(id)?.focus();
                }}
              >
                {`${labelOf(issue.field)} : ${issue.message}`}
              </a>
            </li>
          );
        })}
      </ul>
    </Alert>
  );
}
