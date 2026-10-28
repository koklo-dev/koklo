"use client";

import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@koklo/ui";
import { BrandMark } from "./brand-mark.tsx";

/** Une seule « équipe » : Koklo. Pas de menu déroulant ni d'ajout (aucune fonction derrière). */
export function TeamSwitcher() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton asChild size="lg" className="cursor-default">
          <div>
            <BrandMark />
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">Koklo</span>
            </div>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
