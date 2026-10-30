import { InMemoryGitProvider } from "../../src/testing/index.ts";
import { runGitProviderConformance } from "./suite.ts";

const NOW = Date.parse("2026-10-30T12:00:00.000Z");

/** Point d'entrée CI : la suite commune contre le faux en mémoire (jamais de réseau). */
runGitProviderConformance("InMemoryGitProvider", async () => {
  let ticks = 0;
  let ids = 0;
  const provider = new InMemoryGitProvider({
    now: () => new Date(NOW + ticks++ * 1000),
    nextId: () => String(++ids),
  });
  return {
    provider,
    owners: {
      organization: { kind: "organization", login: "acme" },
      user: { kind: "user", login: "octo" },
    },
    installationId: { organization: "1001", user: "1002" },
    userCredentials: { token: "uat-fake", expiresAt: "2099-01-01T00:00:00.000Z" },
    capabilities: { deployments: true, mergeableComputed: true, templates: true },
    uniqueName: (prefix) => `${prefix}-${++ids}`,
    seedDeployment: async (repo, deployment) => provider.seedDeployment(repo, deployment),
  };
});
