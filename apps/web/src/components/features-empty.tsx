import { Button, Card, Icon } from "@koklo/ui";

/** Spec lue, aucune fonctionnalité, aucun filtre ; l'équipe qui écrit peut créer la première. */
export function FeaturesEmpty({ onCreate }: { onCreate: (() => void) | undefined }) {
  return (
    <Card className="flex flex-col items-center gap-2 p-8 text-center">
      <Icon name="checklist" size={28} className="text-muted-foreground" />
      <h2 className="text-base font-semibold tracking-[-0.015em]">
        Aucune fonctionnalité pour le moment
      </h2>
      <p className="text-[13px] text-muted-foreground">
        La spec de ce projet ne décrit encore aucune fonctionnalité.
      </p>
      {onCreate ? (
        <Button type="button" className="h-11 md:h-9" onClick={onCreate}>
          <Icon name="add" size={20} />
          Nouvelle fonctionnalité
        </Button>
      ) : null}
    </Card>
  );
}

/** Filtres sans résultat : le message vit dans la région d'état de l'écran, ici seulement l'action. */
export function FeaturesEmptyFiltered({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex">
      <Button variant="outline" className="h-11 w-full md:h-9 md:w-auto" onClick={onClear}>
        Effacer les filtres
      </Button>
    </div>
  );
}

/** `NOT_FOUND` : un projet d'une autre organisation et un projet inexistant donnent la même réponse. */
export function ProjectNotFound() {
  return (
    <Card className="flex flex-col items-center gap-2 p-8 text-center">
      <Icon name="lock" size={28} className="text-muted-foreground" />
      <h2 className="text-base font-semibold tracking-[-0.015em]">Projet introuvable</h2>
      <p className="text-[13px] text-muted-foreground">
        Ce projet n'existe pas ou vous n'y avez pas accès.
      </p>
      <Button asChild variant="outline" className="h-11 md:h-9">
        <a href="/projects">Voir les projets</a>
      </Button>
    </Card>
  );
}
