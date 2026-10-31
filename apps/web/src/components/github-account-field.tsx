import {
  Alert,
  AlertDescription,
  Field,
  FieldError,
  Icon,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@koklo/ui";
import { type Ref, useId } from "react";
import { GENERIC_ERROR } from "../lib/form-errors.ts";
import { ownerKindLabel } from "../lib/github-labels.ts";
import type { AccountsStatus, GithubAccount } from "../lib/use-github-accounts.ts";
import { ErrorNotice } from "./error-notice.tsx";
import { LoadingStatus } from "./loading-status.tsx";

interface AccountFieldProps {
  accounts: GithubAccount[];
  status: AccountsStatus;
  /** Compte retenu : le seul actif, ou celui que la personne a choisi. */
  selected: GithubAccount | undefined;
  onSelect: (installationId: string) => void;
  onReload: () => void;
  error: string | undefined;
  disabled: boolean;
  /** Identifiant du texte de chargement, relié au bouton de création. */
  loadingId: string;
  selectRef: Ref<HTMLButtonElement>;
}

function NoAccount() {
  return (
    <Alert>
      <Icon name="link" size={20} />
      <AlertDescription className="flex flex-col items-start gap-2">
        <p>
          Aucun compte GitHub n'est relié. Le projet sera créé sans dépôt de spec. Vous pourrez
          relier GitHub ensuite.
        </p>
        <a href="/github" className="font-medium underline underline-offset-4">
          Relier GitHub
        </a>
      </AlertDescription>
    </Alert>
  );
}

function SingleAccount({ account }: { account: GithubAccount }) {
  const askUser = account.ownerKind === "user" && account.userAuthorization !== "active";
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm">
        Compte GitHub : <span className="font-mono">{account.ownerLogin}</span> (
        {ownerKindLabel(account.ownerKind)})
      </p>
      {askUser ? (
        <p className="text-[13px] text-muted-foreground">
          Ce compte personnel demande votre autorisation. Koklo vous la demandera si besoin après la
          création du projet.
        </p>
      ) : null}
    </div>
  );
}

function AccountSelect({
  accounts,
  selected,
  onSelect,
  error,
  disabled,
  selectRef,
}: Omit<AccountFieldProps, "status" | "onReload" | "loadingId">) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <Field>
      <Label htmlFor={id}>Compte GitHub</Label>
      <Select value={selected?.id ?? ""} onValueChange={onSelect} disabled={disabled}>
        <SelectTrigger
          id={id}
          ref={selectRef}
          className="h-11 md:h-9"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        >
          <SelectValue placeholder="Choisir un compte" />
        </SelectTrigger>
        <SelectContent>
          {accounts.map((account) => (
            <SelectItem key={account.id} value={account.id}>
              {account.ownerLogin} · {ownerKindLabel(account.ownerKind)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </Field>
  );
}

/** Compte GitHub du dépôt : chargement, erreur, aucun, un seul (lecture seule) ou plusieurs (sans présélection). */
export function GithubAccountField(props: AccountFieldProps) {
  const { accounts, status, selected, onReload, loadingId } = props;
  if (status === "loading") {
    return <LoadingStatus id={loadingId} label="Chargement des comptes GitHub…" rows={1} />;
  }
  if (status === "error") {
    return (
      <ErrorNotice title="Impossible de charger les comptes GitHub" onRetry={onReload}>
        {GENERIC_ERROR}
      </ErrorNotice>
    );
  }
  if (accounts.length === 0) return <NoAccount />;
  if (accounts.length === 1 && selected) return <SingleAccount account={selected} />;
  return <AccountSelect {...props} />;
}
