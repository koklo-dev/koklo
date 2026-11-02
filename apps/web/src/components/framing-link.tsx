import { Button, Icon } from "@koklo/ui";

/** Entrée du cadrage assisté depuis la liste des fonctionnalités (équipe qui écrit, spec lue) : un lien, il navigue. */
export function FramingLink({ projectId }: { projectId: string }) {
  return (
    <Button asChild variant="outline" className="h-11 w-full md:h-9 md:w-auto">
      <a href={`/projects/${projectId}/framing`}>
        <Icon name="smart_toy" size={20} />
        Cadrer avec l'IA
      </a>
    </Button>
  );
}
