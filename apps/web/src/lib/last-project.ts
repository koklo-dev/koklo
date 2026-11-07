import { projectRecentOutputSchema } from "@koklo/contract";
import { PROJECTS_PATH, projectPath, UUID } from "./shell-routes.ts";

/**
 * Destination de `/` et de `/kanban` : le dernier projet ouvert (`project.recent`, lu côté serveur avec le cookie
 * de la requête), sinon `/projects`. Toute erreur (session, réseau, corps inattendu) mène aussi à `/projects` :
 * la garde du proxy y arbitre la session.
 */
export async function lastProjectPath(
  apiUrl: string,
  cookie: string | null,
  suffix: "" | "/tickets" = "",
): Promise<string> {
  try {
    const response = await fetch(new URL("/project-visits", apiUrl), {
      headers: cookie ? { cookie } : {},
      cache: "no-store",
    });
    if (!response.ok) return PROJECTS_PATH;
    const recent = projectRecentOutputSchema.safeParse(await response.json());
    const id = recent.success ? recent.data[0]?.id : undefined;
    return id && UUID.test(id) ? `${projectPath(id)}${suffix}` : PROJECTS_PATH;
  } catch {
    return PROJECTS_PATH;
  }
}
