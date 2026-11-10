import {
  FieldLabel,
  Icon,
  InlineAlert,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@koklo/ui";
import { type Ref, useId } from "react";
import { settingsPath } from "../lib/shell-routes.ts";
import type { GithubAccount } from "../lib/use-github-accounts.ts";
import { ErrorNotice } from "./error-notice.tsx";
import { LoadingStatus } from "./loading-status.tsx";
import { ShellLink } from "./shell-link.tsx";

const KIND = { organization: "organisation", user: "compte personnel" } as const;

/** Icône du compte : `corporate_fare` pour une organisation, `person` pour un compte personnel (maquette 08 l.151-155). */
function AccountLabel({ account }: { account: GithubAccount }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <Icon
        name={account.ownerKind === "user" ? "person" : "corporate_fare"}
        size={18}
        className="text-muted-foreground"
      />
      <span>
        <span className="font-mono text-meta">{account.ownerLogin}</span>{" "}
        <span className="text-meta text-muted-foreground">· {KIND[account.ownerKind]}</span>
      </span>
    </span>
  );
}

interface AccountProps {
  accounts: GithubAccount[];
  status: "loading" | "error" | "ready";
  selected: GithubAccount | undefined;
  onSelect: (installationId: string) => void;
  onReload: () => void;
  error: string | undefined;
  disabled: boolean;
  loadingId: string;
  selectRef: Ref<HTMLButtonElement>;
}

function AccountSelect({ accounts, selected, onSelect, error, disabled, selectRef }: AccountProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={id}>Compte GitHub du dépôt de spec</FieldLabel>
      <Select value={selected?.id ?? ""} onValueChange={onSelect} disabled={disabled}>
        <SelectTrigger
          id={id}
          ref={selectRef}
          className="h-11 md:h-10"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        >
          <SelectValue placeholder="Choisir un compte">
            {selected ? <AccountLabel account={selected} /> : null}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {accounts.map((account) => (
            <SelectItem key={account.id} value={account.id}>
              <AccountLabel account={account} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? (
        <p id={errorId} role="alert" className="text-caption text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Compte GitHub du dépôt (S-projects v7 §4.1) : chargement, erreur, aucun, un seul (« Dépôt créé sur ») ou
 * plusieurs (liste sans présélection, choix obligatoire).
 */
export function ProjectCreateAccount(props: AccountProps) {
  const { accounts, status, selected, onReload, loadingId } = props;
  if (status === "loading") {
    return <LoadingStatus id={loadingId} label="Chargement des comptes GitHub…" rows={1} />;
  }
  if (status === "error") {
    return (
      <ErrorNotice
        id={loadingId}
        title="Impossible de charger les comptes GitHub"
        onRetry={onReload}
      >
        Une erreur est survenue. « Créer le projet » reste indisponible tant que la liste manque.
      </ErrorNotice>
    );
  }
  if (accounts.length === 0) {
    return (
      <InlineAlert variant="neutral" icon="link">
        Aucun compte GitHub n'est relié. Le projet sera créé, le dépôt de spec attendra que vous
        installiez l'application.{" "}
        <ShellLink
          href={settingsPath("github")}
          className="font-medium underline underline-offset-4"
        >
          Relier GitHub
        </ShellLink>
      </InlineAlert>
    );
  }
  if (accounts.length === 1 && selected) {
    return (
      <p className="text-meta">
        Dépôt créé sur <span className="font-mono">{selected.ownerLogin}</span>
      </p>
    );
  }
  return <AccountSelect {...props} />;
}
