import { createMockGitHub, installationAuth, ORG, providerOn } from "../support/mock-github.ts";
import { runGetRepoConformance } from "./get-repo-suite.ts";

/**
 * Point d'entrée CI de l'adaptateur Octokit : la même suite que le faux, sur un transport
 * simulé à état minimal (POST crée le dépôt et attribue un identifiant numérique, GET le relit ;
 * un nom inconnu répond 404 comme GitHub).
 */
runGetRepoConformance("OctokitGitProvider (transport simulé)", async () => {
  let ids = 0;
  let nextRepoId = 5000;
  const mock = createMockGitHub();
  const body = (name: string, id: number) => ({
    id,
    name,
    private: true,
    default_branch: "main",
    html_url: `https://github.com/acme/${name}`,
    owner: { login: "acme", type: "Organization" },
  });
  mock.route("POST /orgs/acme/repos", (request) => {
    const name = (request.body as { name: string }).name;
    const id = ++nextRepoId;
    mock.route(`GET /repos/acme/${name}`, { body: body(name, id) });
    return { status: 201, body: body(name, id) };
  });
  return {
    provider: providerOn(mock),
    owner: ORG,
    auth: async () => installationAuth(),
    uniqueName: (prefix) => `${prefix}-${++ids}`,
  };
});
