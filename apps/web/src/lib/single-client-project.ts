import { projectCardsOutputSchema } from "@koklo/contract";
import { projectPath, UUID } from "./shell-routes.ts";

/**
 * Destination de `/projects` pour un client qui n'a qu'un projet (B305) : `project.cards` lu côté serveur avec le
 * cookie de la requête. Tout autre cas (équipe, plusieurs projets, erreur) rend `null` : la liste s'affiche.
 */
export async function singleClientProjectPath(
  apiUrl: string,
  cookie: string | null,
): Promise<string | null> {
  try {
    const response = await fetch(new URL("/projects/cards?limit=2", apiUrl), {
      headers: cookie ? { cookie } : {},
      cache: "no-store",
    });
    if (!response.ok) return null;
    const cards = projectCardsOutputSchema.safeParse(await response.json());
    if (!cards.success || cards.data.audience !== "client" || cards.data.total !== 1) return null;
    const id = cards.data.items[0]?.id;
    return id && UUID.test(id) ? projectPath(id) : null;
  } catch {
    return null;
  }
}
