"use client";

import {
  Button,
  CommandPalette,
  type CommandPaletteGroup,
  ProjectHeader,
  ShellContext,
  ShellNavItem,
  SpecNav,
} from "@koklo/ui";
import { type ReactNode, useState } from "react";
import { DevUiFrame, DevUiSection } from "./dev-ui-frame.tsx";

const HREFS = { functional: "/dev/ui#dev-ui-shell" };

const RESULTS: CommandPaletteGroup[] = [
  {
    key: "projects",
    label: "Projets",
    items: [{ id: "p1", kind: "Projet", title: "Atelier Nova", href: "/dev/ui" }],
  },
  {
    key: "tickets",
    label: "Tickets",
    items: [{ id: "t1", kind: "TK-12", title: "Corriger la facture", href: "/dev/ui" }],
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

function Palette() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("ready");
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setOpen(true)}>
          Ouvrir la palette
        </Button>
        {(["idle", "loading", "ready", "error"] as const).map((s) => (
          <Button key={s} variant="ghost" aria-pressed={status === s} onClick={() => setStatus(s)}>
            {s}
          </Button>
        ))}
      </div>
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        onSearch={() => {}}
        onSelect={() => {}}
        onRetry={() => setStatus("ready")}
        status={status}
        groups={status === "ready" ? RESULTS : []}
      />
    </>
  );
}

/** Section « Coquille » (TK-88) : barre, groupe SPEC, en-tête de projet, palette ⌘K. */
export function DevUiShell() {
  return (
    <DevUiSection id="dev-ui-shell" title="Coquille">
      <DevUiFrame title="Barre étendue : entrées et groupe SPEC">
        <Rail collapsed={false}>
          <ShellNavItem href="/dev/ui" icon="space_dashboard" label="Vue d'ensemble" active />
          <ShellNavItem href="/dev/ui" icon="view_kanban" label="Tickets" />
          <SpecNav hrefs={HREFS} activeKey="functional" validatedCount={0} />
        </Rail>
      </DevUiFrame>
      <DevUiFrame title="Rail replié (64 px)">
        <Rail collapsed>
          <ShellNavItem href="/dev/ui" icon="space_dashboard" label="Vue d'ensemble" active />
          <SpecNav hrefs={HREFS} activeKey="functional" />
        </Rail>
      </DevUiFrame>
      <DevUiFrame title="ProjectHeader" wide>
        <ProjectHeader
          className="rounded-xl border"
          headingAs="h4"
          project={{ name: "Atelier Nova", href: "/dev/ui" }}
          section="Spec"
          page="Fonctionnel"
          title="Cahier fonctionnel"
          summary="7 fonctionnalités"
          sha={{ value: "a1b2c3d", age: "il y a 3 min" }}
          primaryAction={<Button>Nouvelle fonctionnalité</Button>}
          secondaryActions={<Button variant="outline">Cadrer avec l'IA</Button>}
          tabsLabel="Sections de la spec"
          tabs={[
            { label: "Fonctionnalités", href: "/dev/ui", active: true, count: 7 },
            { label: "Décisions", href: "/dev/ui" },
          ]}
        />
      </DevUiFrame>
      <DevUiFrame title="Palette ⌘K">
        <Palette />
      </DevUiFrame>
    </DevUiSection>
  );
}
