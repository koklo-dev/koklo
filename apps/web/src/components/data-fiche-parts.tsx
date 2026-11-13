"use client";

import { type DiagramRelation, EntityChip } from "@koklo/ui";

/** Libellé de section de la fiche : petites majuscules 12/600 (maquette 11 l.221, 225). */
export const SECTION =
  "text-caption font-semibold uppercase tracking-[0.05em] text-muted-foreground";

/** Relations des deux sens, écrites « cardinalité Source → Cible » (B423 : aucune phrase inventée). */
export function Relations({
  links,
  nameOf,
}: {
  links: readonly DiagramRelation[];
  nameOf: (id: string) => string;
}) {
  return (
    <section aria-labelledby="fiche-relations" className="flex flex-col gap-1.5">
      <span id="fiche-relations" className={SECTION}>
        Relations
      </span>
      {links.length === 0 ? (
        <p className="m-0 text-meta text-muted-foreground">Aucune relation</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {links.map((link) => (
            <li key={link.id} className="flex items-center gap-2 text-meta">
              <span className="min-w-[52px] shrink-0 whitespace-nowrap font-mono text-code text-muted-foreground">
                {link.label}
              </span>
              <span>{`${nameOf(link.from)} → ${nameOf(link.to)}`}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** « Utilisée par » : une pastille par fonctionnalité ou règle citée, avec son libellé quand on le connaît (jamais le seul accès : pas de lien sans page). */
export function UsedBy({ sources }: { sources: ReadonlyArray<{ id: string; label?: string }> }) {
  if (sources.length === 0) return null;
  return (
    <section aria-labelledby="fiche-used-by" className="flex flex-col gap-1.5">
      <span id="fiche-used-by" className={SECTION}>
        Utilisée par
      </span>
      <div className="flex flex-wrap gap-1.5">
        {sources.map(({ id, label }) => (
          <EntityChip
            key={id}
            kind={id.startsWith("R-") ? "rule" : "feature"}
            id={id}
            {...(label ? { title: label } : {})}
          />
        ))}
      </div>
    </section>
  );
}
