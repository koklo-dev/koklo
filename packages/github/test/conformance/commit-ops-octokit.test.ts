import { createMockGitServer } from "../support/mock-git-server.ts";
import { installationAuth, ORG, providerOn } from "../support/mock-github.ts";
import { runCommitOpsConformance } from "./commit-ops-suite.ts";

/**
 * Point d'entrée CI de l'adaptateur Octokit : la même suite que le faux, sur un serveur Git
 * simulé à état (arbres, commits, références, refus de non fast-forward). Le sous-ensemble
 * d'API reproduit est décrit en tête de `support/mock-git-server.ts`.
 */
runCommitOpsConformance("OctokitGitProvider (transport simulé)", async () => {
  let ids = 0;
  const server = createMockGitServer();
  return {
    provider: providerOn(server),
    owner: ORG,
    auth: async () => installationAuth(),
    uniqueName: (prefix) => `${prefix}-${++ids}`,
  };
});
