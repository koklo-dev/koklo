"use client";

import {
  SecondaryNav,
  type SecondaryNavGroup,
  ShellContext,
  ShellNavGroup,
  ShellNavItem,
} from "@koklo/ui";
import type { ReactNode } from "react";
import { DevUiFrame, DevUiNote, DevUiSection } from "./dev-ui-frame.tsx";

const SETTINGS: SecondaryNavGroup[] = [
  {
    label: "Atelier",
    items: [
      { href: "/dev/ui#dev-ui-nav", icon: "settings", label: "Général", current: true },
      { href: "/dev/ui#dev-ui-nav", icon: "groups", label: "Membres", count: 4 },
    ],
  },
  {
    label: "Sécurité",
    items: [{ href: "/dev/ui#dev-ui-nav", icon: "key", label: "Accès et clés" }],
  },
];

function Rail({ collapsed, children }: { collapsed: boolean; children: ReactNode }) {
  return (
    <ShellContext.Provider value={{ collapsed, mobile: false, toggle: () => {} }}>
      <div
        className={`flex flex-col gap-3 rounded-xl border border-sidebar-border bg-sidebar p-3 ${collapsed ? "w-16" : "w-64"}`}
      >
        {children}
      </div>
    </ShellContext.Provider>
  );
}

function RailEntries() {
  return (
    <>
      <ShellNavGroup label="Projet">
        <ShellNavItem
          href="/dev/ui#dev-ui-nav"
          icon="space_dashboard"
          label="Vue d'ensemble"
          active
        />
        <ShellNavItem href="/dev/ui#dev-ui-nav" icon="view_kanban" label="Tickets" count={12} />
      </ShellNavGroup>
      <ShellNavGroup label="Atelier" separator>
        <ShellNavItem href="/dev/ui#dev-ui-nav" icon="groups" label="Membres" />
      </ShellNavGroup>
    </>
  );
}

/** Section « Navigation · C » (TK-140) : groupes de barre, compteur, navigation secondaire. */
export function DevUiNav() {
  return (
    <DevUiSection id="dev-ui-nav" title="Navigation · C">
      <DevUiFrame title="ShellNavGroup et ShellNavItem count : barre étendue">
        <Rail collapsed={false}>
          <RailEntries />
        </Rail>
      </DevUiFrame>
      <DevUiFrame title="Rail replié : trait de 24, nom « Tickets, 12 »">
        <Rail collapsed>
          <RailEntries />
        </Rail>
      </DevUiFrame>
      <DevUiFrame title="SecondaryNav (240 dès 768, rangée défilante en dessous)" wide>
        <SecondaryNav label="Sections des réglages" groups={SETTINGS} />
        <DevUiNote>Entrée courante : fond secondaire, 600, icône pleine</DevUiNote>
      </DevUiFrame>
    </DevUiSection>
  );
}
