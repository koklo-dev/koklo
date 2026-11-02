import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Separator,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@koklo/ui";
import { Fragment, type ReactNode } from "react";
import { AppSidebar } from "./app-sidebar.tsx";

/** Maillons du fil d'Ariane après « Koklo » : le dernier est la page courante, les autres des libellés non cliquables. */
function Crumbs({ trail }: { trail: readonly string[] }) {
  const page = trail.at(-1);
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem className="hidden md:block">Koklo</BreadcrumbItem>
        <BreadcrumbSeparator className="hidden md:block" />
        {trail.slice(0, -1).map((label) => (
          <Fragment key={label}>
            <BreadcrumbItem>{label}</BreadcrumbItem>
            <BreadcrumbSeparator />
          </Fragment>
        ))}
        <BreadcrumbItem>
          <BreadcrumbPage>{page}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/**
 * Gabarit d'application (sidebar-07) commun aux pages de l'organisation active. Sans `current`, la page porte
 * elle-même son fil d'Ariane (page d'un projet : Koklo > Projets > nom > page). `current` : la page, ou la
 * suite des maillons (Koklo > Réglages > IA) dont seul le dernier est la page courante.
 */
export function AppFrame({
  current,
  children,
}: {
  current?: string | readonly string[];
  children: ReactNode;
}) {
  const trail = typeof current === "string" ? [current] : current;
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="flex h-16 shrink-0 items-center gap-2 px-4 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 md:px-8">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          {trail?.length ? <Crumbs trail={trail} /> : null}
        </header>
        <div className="flex min-w-0 flex-1 flex-col p-4 pt-0 md:p-8 md:pt-0">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
