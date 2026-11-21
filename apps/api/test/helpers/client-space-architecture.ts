import type { INestApplication } from "@nestjs/common";
import type { Actor } from "./organizations.ts";
import { send } from "./tickets.ts";

/** Client HTTP des cinq procédures `clientSpace.architecture*` du contrat 3.11.0. */
export function clientArchitectureApi(
  app: INestApplication,
  actor: Pick<Actor, "cookie"> | undefined,
) {
  const get = (projectId: string, path: string) =>
    send(app, actor?.cookie, "get", `/client-space/projects/${projectId}/architecture${path}`);
  return {
    architecture: (projectId: string) => get(projectId, ""),
    adrs: (projectId: string, query = "") => get(projectId, `/adrs${query}`),
    adr: (projectId: string, adrId: string) => get(projectId, `/adrs/${adrId}`),
    flows: (projectId: string, query = "") => get(projectId, `/flows${query}`),
    flow: (projectId: string, flowId: string) => get(projectId, `/flows/${flowId}`),
  };
}
