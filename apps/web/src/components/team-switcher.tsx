"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@koklo/ui";
import { useRouter } from "next/navigation";
import { ROLE_LABELS } from "../lib/roles.ts";
import { useActivateOrganization } from "../lib/use-activate-organization.ts";
import { useActiveOrganization } from "../lib/use-active-organization.ts";
import { BrandMark } from "./brand-mark.tsx";

/** Organisation active (nom, rôle) et menu pour en changer ou en créer une autre. */
export function TeamSwitcher() {
  const { isMobile } = useSidebar();
  const router = useRouter();
  const { organizations, active, activeId } = useActiveOrganization();
  const activate = useActivateOrganization();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <BrandMark />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{active?.name ?? "Koklo"}</span>
                {active ? (
                  <span className="truncate text-xs">{ROLE_LABELS[active.role]}</span>
                ) : null}
              </div>
              <Icon name="unfold_more" size={16} className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="start"
            sideOffset={4}
          >
            <DropdownMenuLabel>Organisations</DropdownMenuLabel>
            {organizations.data?.map((organization) => (
              <DropdownMenuItem
                key={organization.id}
                onSelect={() =>
                  activate.mutate(organization.id, { onSuccess: () => router.refresh() })
                }
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
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
