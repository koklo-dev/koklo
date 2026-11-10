"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
import { useId, useRef, useState } from "react";
import { RETRY_LATER } from "../lib/form-errors.ts";
import {
  type CreatedProject,
  type CreateErrors,
  useProjectCreate,
} from "../lib/use-project-create.ts";
import { ProjectCreateAccount } from "./project-create-account.tsx";
import {
  EuField,
  errorSummary,
  IdentityFields,
  RepoNameField,
  TemplateField,
} from "./project-create-fields.tsx";

interface DialogProps {
  open: boolean;
  /** Propriétaire ou administrateur : la case « Données en UE ». */
  canSetEu: boolean;
  onCreated: (project: CreatedProject) => void;
  onClose: () => void;
  /** Rend le focus au bouton « Nouveau projet », même si la liste l'a remplacé. */
  onReturnFocus: () => void;
}

/** Plein écran sous 768 px (S-projects v7 §6) ; panneau centré de 520 au-dessus. */
const PANEL =
  "max-md:inset-0 max-md:left-0 max-md:top-0 max-md:h-full max-md:max-h-none max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:border-0";

function Abandon({
  open,
  onKeep,
  onAbandon,
}: {
  open: boolean;
  onKeep: () => void;
  onAbandon: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => next || onKeep()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Abandonner la création ?</AlertDialogTitle>
          <AlertDialogDescription>
            Ce que vous avez saisi ne sera pas enregistré.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onKeep}>Continuer la saisie</AlertDialogCancel>
          <AlertDialogAction onClick={onAbandon}>Abandonner</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function FormAlerts({ create }: { create: ReturnType<typeof useProjectCreate> }) {
  const summary = errorSummary(create.errors);
  return (
    <>
      {summary.length > 1 ? (
        <InlineAlert variant="error" icon="error">
          Corrigez {summary.length} champs avant de continuer.
        </InlineAlert>
      ) : null}
      {create.formError === "forbidden" ? (
        <InlineAlert variant="error" icon="lock">
          Vous n'avez pas le droit de créer un projet.
        </InlineAlert>
      ) : null}
      {create.formError === "generic" ? (
        <InlineAlert variant="error" icon="error">
          Le projet n'a pas pu être créé. {RETRY_LATER}
        </InlineAlert>
      ) : null}
    </>
  );
}

interface FieldRefs {
  name: React.RefObject<HTMLInputElement | null>;
  email: React.RefObject<HTMLInputElement | null>;
  account: React.RefObject<HTMLButtonElement | null>;
  repo: React.RefObject<HTMLInputElement | null>;
}

/** Corps de la boîte : alertes, identité, structure, compte GitHub et nom du dépôt, case UE. */
function Fields({
  create,
  refs,
  waitId,
  canSetEu,
}: {
  create: ReturnType<typeof useProjectCreate>;
  refs: FieldRefs;
  waitId: string;
  canSetEu: boolean;
}) {
  return (
    <DialogBody className="flex-1">
      <FormAlerts create={create} />
      <IdentityFields create={create} nameRef={refs.name} emailRef={refs.email} />
      <TemplateField create={create} />
      <div className="flex flex-col gap-1.5">
        <ProjectCreateAccount
          accounts={create.accounts.accounts}
          status={create.accounts.status}
          selected={create.account}
          onSelect={(id) => create.setField("accountId", id)}
          onReload={create.accounts.reload}
          error={create.errors.account}
          disabled={create.pending}
          loadingId={waitId}
          selectRef={refs.account}
        />
        {create.accounts.accounts.length > 0 ? (
          <RepoNameField create={create} repoRef={refs.repo} />
        ) : null}
      </div>
      {canSetEu ? <EuField create={create} /> : null}
    </DialogBody>
  );
}

/** Premier champ en erreur, dans l'ordre de la boîte : il reçoit le focus. */
function focusFirstError(errors: CreateErrors, refs: FieldRefs): void {
  const order: [string | undefined, React.RefObject<HTMLElement | null>][] = [
    [errors.name, refs.name],
    [errors.clientEmail, refs.email],
    [errors.account, refs.account],
    [errors.repoName, refs.repo],
  ];
  order.find(([message]) => message)?.[1].current?.focus();
}

/**
 * Boîte « Nouveau projet » en une étape (maquette 08 l.124-163, S-projects v7 §4.1). La page la remonte à chaque
 * ouverture (`key`) : elle repart de zéro, avec une nouvelle clé d'idempotence.
 */
export function ProjectCreateDialog({
  open,
  canSetEu,
  onCreated,
  onClose,
  onReturnFocus,
}: DialogProps) {
  const create = useProjectCreate({ canSetEu, onCreated });
  const [confirming, setConfirming] = useState(false);
  const refs: FieldRefs = {
    name: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    account: useRef<HTMLButtonElement>(null),
    repo: useRef<HTMLInputElement>(null),
  };
  const waitId = useId();
  const accountsPending = create.accounts.status !== "ready";

  const requestClose = () => {
    if (create.pending) return;
    if (create.dirty) setConfirming(true);
    else onClose();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => next || requestClose()}>
        <DialogContent
          data-testid="create-project-dialog"
          className={PANEL}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            refs.name.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            onReturnFocus();
          }}
        >
          <form
            onSubmit={(event) => {
              const errors = create.submit(event);
              if (errors) focusFirstError(errors, refs);
            }}
            noValidate
            className="flex min-h-0 flex-1 flex-col"
          >
            <DialogHeader>
              <DialogTitle>Nouveau projet</DialogTitle>
              <DialogDescription>
                Le projet démarre par le dossier d'idée. Le dépôt de spec est créé en arrière-plan.
              </DialogDescription>
            </DialogHeader>
            <Fields create={create} refs={refs} waitId={waitId} canSetEu={canSetEu} />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="h-11 md:h-9"
                onClick={requestClose}
              >
                Annuler
              </Button>
              <Button
                type="submit"
                className="h-11 md:h-9"
                disabled={create.pending || accountsPending}
                aria-describedby={accountsPending ? waitId : undefined}
              >
                {create.pending ? "Création…" : "Créer le projet"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Abandon
        open={confirming}
        onKeep={() => setConfirming(false)}
        onAbandon={() => {
          setConfirming(false);
          onClose();
        }}
      />
    </>
  );
}
