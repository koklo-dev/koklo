"use client";

import {
  Icon,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@koklo/ui";
import { useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/orpc.ts";

/** Projets réels (`project.list`) ; pas de page de détail, donc non cliquables. Masqué sans données. */
export function NavProjects() {
  const { data: projects } = useQuery(orpc.project.list.queryOptions());
  if (!projects?.length) return null;

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Projets</SidebarGroupLabel>
      <SidebarMenu>
        {projects.map((project) => (
          <SidebarMenuItem key={project.id}>
            <SidebarMenuButton asChild className="cursor-default">
              <span>
                <Icon name="account_tree" size={20} />
                <span>{project.name}</span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
