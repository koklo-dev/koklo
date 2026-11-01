"use client";

import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarRail } from "@koklo/ui";
import { usePathname } from "next/navigation";
import type * as React from "react";
import { canListMembers, canManage } from "../lib/roles.ts";
import { useActiveOrganization } from "../lib/use-active-organization.ts";
import { NavMain } from "./nav-main.tsx";
import { NavProjects } from "./nav-projects.tsx";
import { NavUser } from "./nav-user.tsx";
import { TeamSwitcher } from "./team-switcher.tsx";

const PROJECTS_ENTRY = { title: "Projets", url: "/projects", icon: "account_tree" } as const;
const KANBAN_ENTRY = { title: "Kanban", url: "/kanban", icon: "checklist" } as const;
/** Réservée à l'équipe (`member.list` répond 403 au client) ; absente tant que le rôle est inconnu (fail-closed). */
const MEMBERS_ENTRY = { title: "Membres", url: "/members", icon: "person" } as const;

/** Réservée aux propriétaires et administrateurs ; tant que le rôle est inconnu, elle n'est pas rendue. */
const GITHUB_ENTRY = { title: "GitHub", url: "/github", icon: "link" } as const;

function Navigation() {
  const pathname = usePathname();
  const { role } = useActiveOrganization();
  const entries = [
    PROJECTS_ENTRY,
    KANBAN_ENTRY,
    ...(canListMembers(role) ? [MEMBERS_ENTRY] : []),
    ...(canManage(role) ? [GITHUB_ENTRY] : []),
  ];
  return <NavMain items={entries.map((item) => ({ ...item, isActive: pathname === item.url }))} />;
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <Navigation />
        <NavProjects />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
