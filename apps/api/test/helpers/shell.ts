import type { INestApplication } from "@nestjs/common";
import type { Actor } from "./organizations.ts";
import { send } from "./tickets.ts";

/** Procédures de la coquille (TK-88, contrat 2.1.0) : appels HTTP réels d'un acteur. */
export function shellApi(app: INestApplication, actor: Pick<Actor, "cookie"> | undefined) {
  const cookie = actor?.cookie;
  return {
    shell: (projectId: string) => send(app, cookie, "get", `/projects/${projectId}/shell`),
    visit: (projectId: string) => send(app, cookie, "post", `/projects/${projectId}/visit`, {}),
    recent: () => send(app, cookie, "get", "/project-visits"),
    search: (query: string) => send(app, cookie, "get", `/search${query}`),
  };
}

export const DELIVERABLE_KEYS = [
  "functional",
  "data",
  "architecture",
  "technical",
  "security",
  "design",
  "quality",
] as const;
