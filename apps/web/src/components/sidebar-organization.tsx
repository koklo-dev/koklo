"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  useShell,
} from "@koklo/ui";
import { useRouter } from "next/navigation";
import { ROLE_LABELS } from "../lib/roles.ts";
import { useActivateOrganization } from "../lib/use-activate-organization.ts";
import { useActiveOrganization } from "../lib/use-active-organization.ts";

/** Initiales de la tuile : première lettre de deux mots au plus. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/** Sélecteur d'organisation : tuile d'initiales, nom, « Organisation · rôle », menu pour changer ou en créer une. */
export function SidebarOrganization() {
  const { collapsed, mobile } = useShell();
  const router = useRouter();
  const { organizations, active, activeId } = useActiveOrganization();
  const activate = useActivateOrganization();
  const name = active?.name ?? "Koklo";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-11 [@media(max-height:900px)]:h-10 w-full items-center gap-2.5 rounded-lg px-1.5 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent"
        >
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground"
          >
            {initialsOf(name)}
          </span>
          {collapsed ? <span className="sr-only">{name}</span> : null}
          {collapsed ? null : (
            <>
              <span className="grid min-w-0 flex-1 leading-tight">
                <span className="truncate text-body font-semibold">{name}</span>
                {active ? (
                  <span className="truncate text-caption text-muted-foreground">
                    {`Organisation · ${ROLE_LABELS[active.role]}`}
                  </span>
                ) : null}
              </span>
              <Icon name="unfold_more" size={16} className="shrink-0 text-muted-foreground" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="min-w-56 rounded-lg"
        side={mobile ? "bottom" : "right"}
        align="start"
        sideOffset={4}
      >
        <DropdownMenuLabel>Organisations</DropdownMenuLabel>
        {organizations.data?.map((organization) => (
          <DropdownMenuItem
            key={organization.id}
            onSelect={() => activate.mutate(organization.id, { onSuccess: () => router.refresh() })}
          >
            <span className="flex-1 truncate">{organization.name}</span>
            {organization.id === activeId ? (
              <>
                <Icon name="check" size={16} />
                <span className="sr-only">(active)</span>
              </>
            ) : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/organizations")}>
          <Icon name="add" size={20} />
          Créer une organisation
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
