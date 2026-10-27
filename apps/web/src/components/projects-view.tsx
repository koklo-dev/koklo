import {
  Alert,
  AlertDescription,
  AlertTitle,
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
}

function Loading() {
  return (
    <div
      role="status"
      aria-busy="true"
      data-testid="projects-loading"
      className="flex flex-col gap-3"
    >
      <p className="text-[13px] text-muted-foreground">Chargement des projets…</p>
      {[0, 1, 2].map((row) => (
        <div key={row} className="h-10 rounded-md bg-muted motion-safe:animate-pulse" />
      ))}
    </div>
  );
}

function Empty() {
  return (
    <Card data-testid="projects-empty" className="flex flex-col items-center gap-2 p-8 text-center">
      <Icon name="account_tree" size={28} className="text-muted-foreground" />
      <h2 className="text-base font-semibold tracking-[-0.015em]">Aucun projet pour le moment</h2>
      <p className="text-[13px] text-muted-foreground">
        Les projets auxquels vous avez accès apparaîtront ici.
      </p>
    </Card>
  );
}

function Failure({ onRetry }: { onRetry: () => void }) {
  return (
    <Alert variant="destructive" data-testid="projects-error">
      <Icon name="warning" size={20} />
      <AlertTitle>Impossible de charger les projets</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <p>Une erreur est survenue. Vérifiez votre connexion puis réessayez.</p>
        <Button variant="outline" className="h-11 md:h-9" onClick={onRetry}>
          Réessayer
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function Projects({ projects }: { projects: ProjectRow[] }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-muted-foreground">
        {projects.length === 1 ? "1 projet" : `${projects.length} projets`}
      </p>
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
export function ProjectsView({ state, onRetry }: ProjectsViewProps) {
  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <Failure onRetry={onRetry} />;
  return state.projects.length === 0 ? <Empty /> : <Projects projects={state.projects} />;
}
