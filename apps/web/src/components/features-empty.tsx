import { Button, Card, EmptyState, formatCount, Icon } from "@koklo/ui";
import { FramingLink } from "./framing-link.tsx";

/** Spec lue, aucune fonctionnalité, aucun filtre ; l'équipe qui écrit peut créer la première. */
export function FeaturesEmpty({
  projectId,
  onCreate,
}: {
  projectId: string;
  onCreate: (() => void) | undefined;
}) {
  return (
    <Card className="flex flex-col items-center gap-2 p-8 text-center">
      <Icon name="checklist" size={28} className="text-muted-foreground" />
      <h2 className="text-section-title">Aucune fonctionnalité pour le moment</h2>
      <p className="text-meta text-muted-foreground">
        La spec de ce projet ne décrit encore aucune fonctionnalité.
      </p>
      {onCreate ? (
        <div className="flex flex-col gap-2 md:flex-row">
          <FramingLink projectId={projectId} />
          <Button type="button" className="h-11 md:h-9" onClick={onCreate}>
            <Icon name="add" size={20} />
            Nouvelle fonctionnalité
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

/**
 * Recherche ou filtres sans résultat : l'état vide dit sur quoi porte la recherche (tout le projet) et propose
 * l'unique action utile, effacer la recherche ou, sans recherche, les filtres.
 */
export function FeaturesEmptyFiltered({
  q,
  projectTotal,
  onClearSearch,
  onClearFilters,
}: {
  q: string | undefined;
  projectTotal: number | undefined;
  onClearSearch: () => void;
  onClearFilters: () => void;
}) {
  if (!q) {
    return (
      <EmptyState
        icon="search_off"
        title="Aucune fonctionnalité ne correspond à ces filtres."
        description="Modifiez ou effacez les filtres pour revoir la liste."
        action={
          <Button variant="outline" className="h-11 md:h-9" onClick={onClearFilters}>
            Effacer les filtres
          </Button>
        }
      />
    );
  }
  const scope =
    projectTotal === undefined
      ? "La recherche porte sur toutes les fonctionnalités, pas seulement celles affichées."
      : `La recherche porte sur les ${formatCount(projectTotal)} fonctionnalités, pas seulement celles affichées.`;
  return (
    <EmptyState
      icon="search_off"
      title={`Aucune fonctionnalité ne correspond à « ${q} »`}
      description={scope}
      action={
        <Button variant="outline" className="h-11 md:h-9" onClick={onClearSearch}>
          Effacer la recherche
        </Button>
      }
    />
  );
}

/** `NOT_FOUND` : un projet d'une autre organisation et un projet inexistant donnent la même réponse. */
export function ProjectNotFound() {
  return (
    <Card className="flex flex-col items-center gap-2 p-8 text-center">
      <Icon name="lock" size={28} className="text-muted-foreground" />
      <h2 className="text-section-title">Projet introuvable</h2>
      <p className="text-meta text-muted-foreground">
        Ce projet n'existe pas ou vous n'y avez pas accès.
      </p>
      <Button asChild variant="outline" className="h-11 md:h-9">
        <a href="/projects">Voir les projets</a>
      </Button>
    </Card>
  );
}
