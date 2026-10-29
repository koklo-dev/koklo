import type { OrganizationListOutput } from "@koklo/contract";
import { Badge, Button, Icon } from "@koklo/ui";
import { ROLE_LABELS } from "../lib/roles.ts";

interface OrganizationListProps {
  organizations: OrganizationListOutput;
  activeId: string | null | undefined;
  /** Identifiant de l'organisation en cours d'ouverture. */
  openingId: string | undefined;
  onOpen: (organizationId: string) => void;
}

/** Une ligne par organisation : nom, rôle, et « Ouvrir » ou « Active » (icône + texte). */
export function OrganizationList({
  organizations,
  activeId,
  openingId,
  onOpen,
}: OrganizationListProps) {
  return (
    <ul className="flex flex-col gap-3">
      {organizations.map((organization) => (
        <li
          key={organization.id}
          className="grid items-center gap-2 md:grid-cols-[1fr_auto_auto] md:gap-3"
        >
          <span className="truncate font-medium">{organization.name}</span>
          <Badge variant="outline" className="w-fit">
            {ROLE_LABELS[organization.role]}
          </Badge>
          {organization.id === activeId ? (
            <span className="flex items-center gap-1 text-[13px] font-medium">
              <Icon name="check" size={16} />
              Active
            </span>
          ) : (
            <Button
              variant="outline"
              className="h-11 w-full md:h-9 md:w-auto"
              aria-label={`Ouvrir l'organisation ${organization.name}`}
              aria-busy={openingId === organization.id}
              disabled={openingId !== undefined}
              onClick={() => onOpen(organization.id)}
            >
              Ouvrir
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
