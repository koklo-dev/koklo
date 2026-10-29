import {
  Button,
  Card,
  Icon,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@koklo/ui";
import type { Ref } from "react";
import { GENERIC_ERROR } from "../lib/form-errors.ts";
import { ErrorNotice } from "./error-notice.tsx";
import { LoadingStatus } from "./loading-status.tsx";

export interface ProjectRow {
  id: string;
  name: string;
}

export type ProjectsState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "success"; projects: ProjectRow[] };

interface ProjectsViewProps {
  state: ProjectsState;
  onRetry: () => void;
  /** Ouvre le panneau de création ; absent quand le rôle ne permet pas de créer un projet. */
  onCreate?: () => void;
  createButtonRef?: Ref<HTMLButtonElement>;
}

function CreateButton({
  onCreate,
  buttonRef,
}: {
  onCreate: () => void;
  buttonRef?: Ref<HTMLButtonElement> | undefined;
}) {
  return (
    <Button
      ref={buttonRef}
      data-testid="create-project-button"
      className="h-11 md:h-9"
      onClick={onCreate}
    >
      <Icon name="add" size={20} />
      Créer un projet
    </Button>
  );
}

function Empty({
  onCreate,
  createButtonRef,
}: Pick<ProjectsViewProps, "onCreate" | "createButtonRef">) {
  return (
    <Card data-testid="projects-empty" className="flex flex-col items-center gap-2 p-8 text-center">
      <Icon name="account_tree" size={28} className="text-muted-foreground" />
      <h2 className="text-base font-semibold tracking-[-0.015em]">Aucun projet pour le moment</h2>
      <p className="text-[13px] text-muted-foreground">
        {onCreate
          ? "Créez votre premier projet pour commencer."
          : "Les projets auxquels vous avez accès apparaîtront ici."}
      </p>
      {onCreate ? <CreateButton onCreate={onCreate} buttonRef={createButtonRef} /> : null}
    </Card>
  );
}

function Projects({
  projects,
  onCreate,
  createButtonRef,
}: { projects: ProjectRow[] } & Pick<ProjectsViewProps, "onCreate" | "createButtonRef">) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          {projects.length === 1 ? "1 projet" : `${projects.length} projets`}
        </p>
        {onCreate ? <CreateButton onCreate={onCreate} buttonRef={createButtonRef} /> : null}
      </div>
      <Table data-testid="projects-table">
        <TableCaption className="sr-only">Liste des projets</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Nom</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((project) => (
            <TableRow key={project.id}>
              <TableCell>{project.name}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Les quatre états de la liste des projets (chargement, vide, données, erreur). */
export function ProjectsView({ state, onRetry, onCreate, createButtonRef }: ProjectsViewProps) {
  if (state.status === "loading") {
    return <LoadingStatus label="Chargement des projets…" data-testid="projects-loading" />;
  }
  if (state.status === "error") {
    return (
      <ErrorNotice
        data-testid="projects-error"
        title="Impossible de charger les projets"
        onRetry={onRetry}
      >
        {GENERIC_ERROR}
      </ErrorNotice>
    );
  }
  return state.projects.length === 0 ? (
    <Empty onCreate={onCreate} createButtonRef={createButtonRef} />
  ) : (
    <Projects projects={state.projects} onCreate={onCreate} createButtonRef={createButtonRef} />
  );
}
