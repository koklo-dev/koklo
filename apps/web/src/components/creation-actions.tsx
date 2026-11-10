"use client";

import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@koklo/ui";
import { useId, useState } from "react";
import { ASK_ADMIN, type CreationAction, type FailureView } from "../lib/creation-copy.ts";
import { settingsPath } from "../lib/shell-routes.ts";
import { isValidSpecRepoName, SPEC_REPO_NAME_ERROR } from "../lib/spec-repo-name.ts";
import type { RetryInput } from "../lib/use-creation-retry.ts";
import { useGithubAccounts } from "../lib/use-github-accounts.ts";
import { useStartInstallation } from "../lib/use-start-installation.ts";
import { FormField } from "./form-field.tsx";
import { ShellLink } from "./shell-link.tsx";

const BUTTON = "h-11 md:h-8";

interface ActionsProps {
  failure: FailureView;
  ownerLogin: string | undefined;
  repoName: string | undefined;
  pending: boolean;
  onRetry: (input?: RetryInput) => void;
}

/** « Choisir un autre nom » puis « Réessayer » (nom pris ou invalide) : le champ est ouvert d'emblée s'il est invalide. */
function RenameForm({
  initial,
  fieldError,
  pending,
  onRetry,
}: {
  initial: string;
  fieldError: string | undefined;
  pending: boolean;
  onRetry: (input: RetryInput) => void;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState(fieldError);
  return (
    <form
      noValidate
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const name = value.trim();
        if (!isValidSpecRepoName(name)) return setError(SPEC_REPO_NAME_ERROR);
        setError(undefined);
        onRetry({ repoName: name });
      }}
    >
      <FormField
        label="Choisir un autre nom"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setError(undefined);
        }}
        error={error}
        readOnly={pending}
        autoComplete="off"
      />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        className={`${BUTTON} self-start`}
        disabled={pending}
      >
        Réessayer
      </Button>
    </form>
  );
}

/** Autre compte GitHub (compte disparu) puis « Réessayer ». */
function AccountForm({
  pending,
  onRetry,
}: {
  pending: boolean;
  onRetry: (input: RetryInput) => void;
}) {
  const accounts = useGithubAccounts(true);
  const [choice, setChoice] = useState("");
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Compte GitHub du dépôt de spec</Label>
      <Select value={choice} onValueChange={setChoice}>
        <SelectTrigger id={id} className="h-11 md:h-9">
          <SelectValue placeholder="Choisir un compte" />
        </SelectTrigger>
        <SelectContent>
          {accounts.accounts.map((account) => (
            <SelectItem key={account.id} value={account.id}>
              {account.ownerLogin}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        variant="outline"
        className={`${BUTTON} self-start`}
        disabled={pending || !choice}
        onClick={() => onRetry({ installationId: choice })}
      >
        Réessayer
      </Button>
    </div>
  );
}

/** « Autoriser Koklo » : relance l'autorisation du compte GitHub concerné (retour par la page GitHub des réglages). */
function AuthorizeButton({ label, ownerLogin }: { label: string; ownerLogin: string | undefined }) {
  const accounts = useGithubAccounts(true);
  const [failure, setFailure] = useState<string>();
  const start = useStartInstallation((next) => setFailure(next.text));
  const target = accounts.accounts.find((account) => account.ownerLogin === ownerLogin);
  return (
    <>
      <Button
        size="sm"
        className={BUTTON}
        disabled={start.active !== undefined}
        onClick={() => {
          setFailure(undefined);
          start.run(target?.id);
        }}
      >
        {label}
      </Button>
      {failure ? <p className="text-caption text-destructive">{failure}</p> : null}
    </>
  );
}

function LinkButton({ href, children }: { href: string; children: string }) {
  return (
    <Button asChild size="sm" variant="outline" className={BUTTON}>
      <ShellLink href={href}>{children}</ShellLink>
    </Button>
  );
}

function ActionButton({ action, props }: { action: CreationAction; props: ActionsProps }) {
  switch (action) {
    case "retry":
      return (
        <Button
          size="sm"
          variant="outline"
          className={BUTTON}
          disabled={props.pending}
          onClick={() => props.onRetry()}
        >
          Réessayer
        </Button>
      );
    case "relink":
      return <LinkButton href={settingsPath("github")}>Relier GitHub</LinkButton>;
    case "openGithub":
      return <LinkButton href={settingsPath("github")}>Ouvrir la page GitHub</LinkButton>;
    case "authorize":
      return <AuthorizeButton label="Autoriser Koklo" ownerLogin={props.ownerLogin} />;
    case "reauthorize":
      return <AuthorizeButton label="Réautoriser Koklo" ownerLogin={props.ownerLogin} />;
    case "rename":
      return null;
    case "pickAccount":
      return null;
  }
}

/** Actions sous la phrase d'un échec : boutons, champ de nom, sélecteur de compte, ou « Demandez à un administrateur ». */
export function CreationActions(props: ActionsProps) {
  const { failure, repoName, pending, onRetry } = props;
  const forms = (
    <>
      {failure.actions.includes("rename") ? (
        <RenameForm
          initial={repoName ?? ""}
          fieldError={failure.fieldError}
          pending={pending}
          onRetry={onRetry}
        />
      ) : null}
      {failure.actions.includes("pickAccount") ? (
        <AccountForm pending={pending} onRetry={onRetry} />
      ) : null}
    </>
  );
  const buttons = failure.actions.filter(
    (action) => action !== "rename" && action !== "pickAccount",
  );
  return (
    <div className="flex flex-col gap-2">
      {failure.askAdmin ? <p className="text-meta">{ASK_ADMIN}</p> : null}
      {buttons.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {buttons.map((action) => (
            <ActionButton key={action} action={action} props={props} />
          ))}
        </div>
      ) : null}
      {forms}
    </div>
  );
}
