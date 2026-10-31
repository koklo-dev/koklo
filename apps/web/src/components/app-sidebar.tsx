"use client";

import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarRail } from "@koklo/ui";
import { usePathname } from "next/navigation";
import type * as React from "react";
import { canManage } from "../lib/roles.ts";
import { useActiveOrganization } from "../lib/use-active-organization.ts";
import { NavMain } from "./nav-main.tsx";
import { NavProjects } from "./nav-projects.tsx";
import { NavUser } from "./nav-user.tsx";
import { TeamSwitcher } from "./team-switcher.tsx";

const NAVIGATION = [
  { title: "Projets", url: "/projects", icon: "account_tree" },
  { title: "Kanban", url: "/kanban", icon: "checklist" },
  { title: "Membres", url: "/members", icon: "person" },
] as const;

/** Réservée aux propriétaires et administrateurs ; tant que le rôle est inconnu, elle n'est pas rendue. */
const GITHUB_ENTRY = { title: "GitHub", url: "/github", icon: "link" } as const;

function Navigation() {
  const pathname = usePathname();
  const { role } = useActiveOrganization();
  const entries = canManage(role) ? [...NAVIGATION, GITHUB_ENTRY] : NAVIGATION;
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
