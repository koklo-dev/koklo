import { Badge, Icon, type IconName, StatusBadge } from "@koklo/ui";
import {
  AUTHORIZATION_LABELS,
  INSTALLATION_STATUS_LABELS,
  type InstallationStatus,
  type UserAuthorization,
} from "../lib/github-labels.ts";

const OUTLINE_ICONS: Record<Exclude<InstallationStatus, "active">, IconName> = {
  suspended: "block",
  deleted: "cancel",
};

/** Statut de l'installation : icône + texte, jamais la couleur seule. */
export function InstallationStatusBadge({ status }: { status: InstallationStatus }) {
  const label = INSTALLATION_STATUS_LABELS[status];
  if (status === "active") return <StatusBadge status="validated" label={label} />;
  return (
    <Badge variant="outline">
      <span className="inline-flex items-center gap-1">
        <Icon name={OUTLINE_ICONS[status]} size={16} />
        {label}
      </span>
    </Badge>
  );
}

/** Autorisation de la personne : « Autorisée » ou à (ré)autoriser. */
export function AuthorizationBadge({ authorization }: { authorization: UserAuthorization }) {
  return (
    <StatusBadge
      status={authorization === "active" ? "validated" : "pending"}
      label={AUTHORIZATION_LABELS[authorization]}
    />
  );
}
