import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@koklo/ui";
import { IDS } from "../lib/framing-ids.ts";
import { HELP_TEXT } from "../lib/framing-labels.ts";

/** En-tête de la page : fil d'Ariane, h1 « Cadrage », nom du projet et phrase d'aide (S-framing §3.1). */
export function FramingHeader({
  projectId,
  name,
}: {
  projectId: string;
  name: string | undefined;
}) {
  return (
    <header>
      <Breadcrumb className="mb-3">
        <BreadcrumbList>
          <BreadcrumbItem>Koklo</BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/projects">Projets</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          {name ? (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink href={`/projects/${projectId}/features`}>{name}</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </>
          ) : null}
          <BreadcrumbItem>
            <BreadcrumbPage>Cadrage</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <h1
        id={IDS.title}
        tabIndex={-1}
        className="text-[30px] font-semibold tracking-[-0.025em] outline-none"
      >
        Cadrage
      </h1>
      <p className="mt-1 break-words text-[13px] text-muted-foreground">
        {name ? `Projet ${name}` : "Projet"}
      </p>
      <p className="mt-2 text-[13px] text-muted-foreground">{HELP_TEXT}</p>
    </header>
  );
}
