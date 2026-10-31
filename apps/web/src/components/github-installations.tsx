import type { InstallationOutput } from "@koklo/contract";
import { Button, cn } from "@koklo/ui";
import { REDIRECTING_LABEL } from "../lib/github-labels.ts";
import { AuthorizationBadge, InstallationStatusBadge } from "./github-status.tsx";

const longDate = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

function noteFor({ status, userAuthorization }: InstallationOutput): string {
  if (status === "suspended")
    return "Suspendue sur GitHub. Réactivez-la depuis vos paramètres GitHub.";
  if (status === "deleted")
    return "Désinstallée sur GitHub. Réinstallez l'application pour la relier de nouveau.";
  if (userAuthorization === "active") return "Koklo peut créer des dépôts sur ce compte.";
  if (userAuthorization === "expired") return "Votre autorisation a expiré.";
  return "Koklo n'a pas encore votre autorisation pour créer des dépôts sur ce compte.";
}

interface RowProps {
  installation: InstallationOutput;
  locked: boolean;
  redirecting: boolean;
  onAuthorize: (installationId: string) => void;
}

function InstallationRow({ installation, locked, redirecting, onAuthorize }: RowProps) {
  const { id, ownerLogin, ownerKind, status, userAuthorization, createdAt } = installation;
  const authorizable = status === "active" && userAuthorization !== "active";
  const verb = userAuthorization === "expired" ? "Réautoriser" : "Autoriser";
  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-4 md:flex-row md:items-center md:justify-between",
        status === "deleted" && "text-muted-foreground",
      )}
    >
      <div className="flex flex-col gap-1">
        <h2 className="font-mono text-base font-normal">{ownerLogin}</h2>
        <p className="text-[13px] text-muted-foreground">
          {ownerKind === "user" ? "Compte personnel" : "Organisation GitHub"}
        </p>
        <p className="text-[13px] text-muted-foreground">
          Installée le {longDate.format(new Date(createdAt))}
        </p>
      </div>
      <div className="flex flex-col gap-2 md:items-start">
        <div className="flex flex-wrap gap-2">
          <InstallationStatusBadge status={status} />
          {status === "active" ? <AuthorizationBadge authorization={userAuthorization} /> : null}
        </div>
        <p className="text-[13px] text-muted-foreground">{noteFor(installation)}</p>
      </div>
      {authorizable ? (
        <Button
          className="h-11 w-full md:h-9 md:w-auto"
          disabled={locked}
          aria-busy={redirecting || undefined}
          aria-label={`${verb} Koklo sur ${ownerLogin}`}
          onClick={() => onAuthorize(id)}
        >
          {redirecting ? REDIRECTING_LABEL : verb}
        </Button>
      ) : null}
    </li>
  );
}

interface InstallationsProps {
  installations: InstallationOutput[];
  /** Identifiant de l'installation dont l'autorisation redirige, le cas échéant. */
  redirectingId: string | undefined;
  locked: boolean;
  onAuthorize: (installationId: string) => void;
}

export function GithubInstallations({
  installations,
  redirectingId,
  locked,
  onAuthorize,
}: InstallationsProps) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-muted-foreground">
        {installations.length === 1 ? "1 installation" : `${installations.length} installations`}
      </p>
      <ul aria-label="Installations GitHub" className="flex flex-col gap-3">
        {installations.map((installation) => (
          <InstallationRow
            key={installation.id}
            installation={installation}
            locked={locked}
            redirecting={redirectingId === installation.id}
            onAuthorize={onAuthorize}
          />
        ))}
      </ul>
    </div>
  );
}
