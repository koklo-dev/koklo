import { InMemoryGitProvider } from "../../src/testing/index.ts";
import { runGetRepoConformance } from "./get-repo-suite.ts";

const NOW = Date.parse("2026-10-30T12:00:00.000Z");

/** Point d'entrée CI : `Repo.id` et `getRepo` contre le faux en mémoire (jamais de réseau). */
runGetRepoConformance("InMemoryGitProvider", async () => {
  let ids = 0;
  const provider = new InMemoryGitProvider({
    now: () => new Date(NOW),
    nextId: () => String(++ids),
  });
  const owner = { kind: "organization", login: "acme" } as const;
  return {
    provider,
    owner,
    auth: () => provider.authenticate({ installation: { id: "1001", owner } }),
    uniqueName: (prefix) => `${prefix}-${++ids}`,
  };
});
