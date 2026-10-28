"use client";

import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarRail } from "@koklo/ui";
import type * as React from "react";
import { NavMain } from "./nav-main.tsx";
import { NavProjects } from "./nav-projects.tsx";
import { NavUser } from "./nav-user.tsx";
import { TeamSwitcher } from "./team-switcher.tsx";

// Données réelles : une seule entrée de navigation existe (la liste des projets).
const navMain = [
  { title: "Projets", url: "/projects", icon: "account_tree" as const, isActive: true },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
        <NavProjects />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
