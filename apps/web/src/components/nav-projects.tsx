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
import { usePathname } from "next/navigation";
import { orpc } from "../lib/orpc.ts";

/** Projets réels (`project.list`), chacun lié à sa page des fonctionnalités. Masqué sans données. */
export function NavProjects() {
  const { data: projects } = useQuery(orpc.project.list.queryOptions());
  const pathname = usePathname();
  if (!projects?.length) return null;

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Projets</SidebarGroupLabel>
      <SidebarMenu>
        {projects.map((project) => {
          const href = `/projects/${project.id}/features`;
          const current = pathname === href;
          return (
            <SidebarMenuItem key={project.id}>
              <SidebarMenuButton asChild isActive={current}>
                <a href={href} aria-current={current ? "page" : undefined}>
                  <Icon name="account_tree" size={20} fill={current} />
                  <span>{project.name}</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
