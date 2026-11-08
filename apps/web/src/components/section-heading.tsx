/** Titre d'une section de Réglages : h2 de 20 px et sa phrase d'introduction (planche 24). */
export function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-settings-title">{title}</h2>
      {description ? <p className="text-meta text-muted-foreground">{description}</p> : null}
    </div>
  );
}
