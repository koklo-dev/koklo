import { IdTag } from "@koklo/ui";
import type { ReactNode } from "react";

/**
 * Tête de la fiche d'un composant (maquette 13 l.219-220), équipe et client : identifiant, type, action, puis le nom.
 * Seul l'identifiant rétrécit (tronqué, complet au survol) : la pastille et le bouton, passés en `shrink-0`, restent
 * dans la fiche ; un nom sans espace se coupe.
 */
export function ComponentFicheHeader({
  id,
  name,
  pill,
  action,
}: {
  id: string;
  name: string;
  pill: ReactNode;
  action: ReactNode;
}) {
  return (
    <>
      <div className="flex items-center gap-2">
        <IdTag truncate>{id}</IdTag>
        {pill}
        <span className="flex-1" />
        {action}
      </div>
      <h2 className="m-0 text-settings-title [overflow-wrap:anywhere]">{name}</h2>
    </>
  );
}
