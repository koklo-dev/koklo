"use client";

import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  InlineAlert,
} from "@koklo/ui";
import { useId, useRef } from "react";
import { settingsPath } from "../lib/shell-routes.ts";
import { type RepoOutcome, useSpecRepoCreate } from "../lib/use-spec-repo-create.ts";
import { FormField } from "./form-field.tsx";
import { ProjectCreateAccount } from "./project-create-account.tsx";
import { ShellLink } from "./shell-link.tsx";

const REPO_HINT =
  "Laissez vide pour utiliser le nom du projet suivi de « -spec ». Lettres, chiffres, points, tirets et tirets bas, 100 caractères maximum.";

interface Props {
  projectId: string;
  open: boolean;
  onDone: (outcome: RepoOutcome) => void;
  onClose: () => void;
  onReturnFocus: () => void;
}

type Repo = ReturnType<typeof useSpecRepoCreate>;

function RepoAlerts({ repo }: { repo: Repo }) {
  const { view } = repo;
  return (
    <>
      {view ? (
        <InlineAlert variant="error" icon="error">
          {view.text}
          {view.githubLink ? (
            <>
              {" "}
              <ShellLink
                href={settingsPath("github")}
                className="font-medium underline underline-offset-4"
              >
                Ouvrir la page GitHub
              </ShellLink>
            </>
          ) : null}
        </InlineAlert>
      ) : null}
      {repo.authFailure ? <p className="text-meta text-destructive">{repo.authFailure}</p> : null}
    </>
  );
}

const AUTH_LABEL = { authorize: "Autoriser Koklo", reauthorize: "Réautoriser Koklo" } as const;

/** « Autoriser Koklo » à la place de l'envoi quand l'échec demande l'autorisation de la personne. */
function RepoSubmit({ repo, waitId }: { repo: Repo; waitId: string }) {
  const { view } = repo;
  if (view && (view.action === "authorize" || view.action === "reauthorize")) {
    return (
      <Button
        type="button"
        className="h-11 md:h-9"
        disabled={repo.authorizing}
        onClick={repo.authorize}
      >
        {AUTH_LABEL[view.action]}
      </Button>
    );
  }
  const waiting = repo.accounts.status !== "ready";
  return (
    <Button
      type="submit"
      className="h-11 md:h-9"
      disabled={repo.pending || waiting || (view !== undefined && view.action !== "retry")}
      aria-describedby={waiting ? waitId : undefined}
    >
      {repo.pending ? "Création…" : view ? "Réessayer" : "Créer le dépôt"}
    </Button>
  );
}

/** Boîte « Créer le dépôt de spec » d'un projet sans dépôt : compte GitHub, nom facultatif, `repo.createSpec`. */
export function SpecRepoCreateDialog({ projectId, open, onDone, onClose, onReturnFocus }: Props) {
  const repo = useSpecRepoCreate(projectId, onDone);
  const waitId = useId();
  const accountRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog open={open} onOpenChange={(next) => next || repo.pending || onClose()}>
      <DialogContent
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onReturnFocus();
        }}
      >
        <form onSubmit={repo.submit} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>Créer le dépôt de spec</DialogTitle>
            <DialogDescription>
              Koklo crée pour ce projet un dépôt privé sur GitHub, qui contient la spécification
              (écrans, fonctionnalités, règles).
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <RepoAlerts repo={repo} />
            <ProjectCreateAccount
              accounts={repo.accounts.accounts}
              status={repo.accounts.status}
              selected={repo.account}
              onSelect={repo.setAccount}
              onReload={repo.accounts.reload}
              error={repo.errors.account}
              disabled={repo.pending}
              loadingId={waitId}
              selectRef={accountRef}
            />
            {repo.accounts.accounts.length > 0 ? (
              <FormField
                label="Nom du dépôt (facultatif)"
                hint={REPO_HINT}
                value={repo.repoName}
                onChange={(event) => repo.setRepoName(event.target.value)}
                readOnly={repo.pending}
                error={repo.errors.repoName}
                autoComplete="off"
              />
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11 md:h-9" onClick={onClose}>
              Annuler
            </Button>
            <RepoSubmit repo={repo} waitId={waitId} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
