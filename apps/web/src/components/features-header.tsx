import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Icon,
} from "@koklo/ui";
import type { Ref } from "react";
import { FramingLink } from "./framing-link.tsx";

/** En-tête de l'écran des fonctionnalités : fil d'Ariane, titre, nom du projet et actions de l'équipe qui écrit. */
export function FeaturesHeader({
  projectId,
  name,
  titleRef,
  onCreate,
}: {
  projectId: string;
  name: string | undefined;
  titleRef: Ref<HTMLHeadingElement>;
  /** Présent seulement pour l'équipe qui écrit, quand la spec est lue. */
  onCreate: (() => void) | undefined;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
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
                <BreadcrumbItem>{name}</BreadcrumbItem>
                <BreadcrumbSeparator />
              </>
            ) : null}
            <BreadcrumbItem>
              <BreadcrumbPage>Fonctionnalités</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <h1
          ref={titleRef}
          tabIndex={-1}
          className="text-[30px] font-semibold tracking-[-0.025em] outline-none"
        >
          Fonctionnalités
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">{name ?? "Projet"}</p>
      </div>
      {onCreate ? (
        <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
          <FramingLink projectId={projectId} />
          <Button
            type="button"
            data-new-feature
            className="h-11 w-full md:h-9 md:w-auto"
            onClick={onCreate}
          >
            <Icon name="add" size={20} />
            Nouvelle fonctionnalité
          </Button>
        </div>
      ) : null}
    </div>
  );
}
