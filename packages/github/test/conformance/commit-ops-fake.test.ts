import { InMemoryGitProvider } from "../../src/testing/index.ts";
import { runCommitOpsConformance } from "./commit-ops-suite.ts";

const NOW = Date.parse("2026-10-30T12:00:00.000Z");

/** Point d'entrée CI : suppression, tête périmée, listFiles et listCommits contre le faux en mémoire. */
runCommitOpsConformance("InMemoryGitProvider", async () => {
  let ids = 0;
  let ticks = 0;
  const provider = new InMemoryGitProvider({
    now: () => new Date(NOW + ticks++ * 1000),
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
