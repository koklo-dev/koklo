"use client";

import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarRail } from "@koklo/ui";
import { usePathname } from "next/navigation";
import type * as React from "react";
import { NavMain } from "./nav-main.tsx";
import { NavProjects } from "./nav-projects.tsx";
import { NavUser } from "./nav-user.tsx";
import { TeamSwitcher } from "./team-switcher.tsx";

const NAVIGATION = [
  { title: "Projets", url: "/projects", icon: "account_tree" },
  { title: "Kanban", url: "/kanban", icon: "checklist" },
  { title: "Membres", url: "/members", icon: "person" },
] as const;

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const items = NAVIGATION.map((item) => ({ ...item, isActive: pathname === item.url }));
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={items} />
        <NavProjects />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
