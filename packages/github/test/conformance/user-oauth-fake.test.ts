import { InMemoryGitProvider } from "../../src/testing/index.ts";
import { runUserOAuthConformance } from "./user-oauth-suite.ts";

const NOW = Date.parse("2026-10-30T12:00:00.000Z");

/** Point d'entrée CI : le faux en mémoire (jamais de réseau). */
runUserOAuthConformance("InMemoryGitProvider", async () => {
  let ids = 0;
  let grants = 0;
  const provider = new InMemoryGitProvider({
    now: () => new Date(NOW),
    nextId: () => String(++ids),
  });
  return {
    provider,
    redirectUri: "https://app.koklo.test/api/github/callback",
    unknownCode: "pas-un-code-du-faux",
    newGrant: async () => {
      const login = `octo${++grants}`;
      const installation = {
        externalId: String(9000 + grants),
        ownerKind: "user",
        ownerLogin: login,
      } as const;
      provider.seedUserInstallation(login, installation);
      return { code: `fake-code-${login}`, installations: [installation] };
    },
  };
});
