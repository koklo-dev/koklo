import type { INestApplication } from "@nestjs/common";
import { projectPath, send } from "./tickets.ts";

/** Commentaires sur un composant, une décision ou un flux d'architecture (3.11.0) : la cible est le projet, `targetRef` désigne l'élément. */
export function commentsOnRef(
  app: INestApplication,
  actor: { cookie: string } | undefined,
  projectId: string,
) {
  const cookie = actor?.cookie;
  const at = (suffix: string) => projectPath(projectId, suffix);
  return {
    create: (targetKind: string, targetRef: string, body = "Un commentaire") =>
      send(app, cookie, "post", at("/comments"), { targetKind, targetRef, body }),
    list: (targetKind: string, targetRef: string) =>
      send(app, cookie, "get", at(`/comments?targetKind=${targetKind}&targetRef=${targetRef}`)),
  };
}
