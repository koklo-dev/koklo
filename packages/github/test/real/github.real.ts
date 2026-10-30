/**
 * Point d'entrée MANUEL (incident 33) : la suite de conformité commune contre GitHub réel.
 * Lancé uniquement par `pnpm --filter @koklo/github test:real` (config `vitest.real.config.ts`,
 * garde `scripts/run-real.ts`) ; jamais collecté par la CI (suffixe `.real.ts`).
 * Les dépôts créés portent le préfixe `koklo-sandbox-` + horodatage et sont supprimés en fin
 * d'exécution (best-effort : sinon, suppression manuelle par ce préfixe).
 */
import { readFileSync } from "node:fs";
import { afterAll } from "vitest";
import { createOctokitGitProvider } from "../../src/index.ts";
import { runGitProviderConformance } from "../conformance/suite.ts";

const env = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") throw new Error(`Variable manquante : ${name}`);
  return value;
};
const privateKey =
  process.env.KOKLO_GH_PRIVATE_KEY ?? readFileSync(env("KOKLO_GH_PRIVATE_KEY_PATH"), "utf8");
const prefix = process.env.KOKLO_GH_SANDBOX_PREFIX ?? "koklo-sandbox";
const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const created: Array<{ owner: string; name: string }> = [];
let counter = 0;

const provider = createOctokitGitProvider({
  appId: env("KOKLO_GH_APP_ID"),
  privateKey,
  clientId: env("KOKLO_GH_CLIENT_ID"),
  clientSecret: env("KOKLO_GH_CLIENT_SECRET"),
  now: () => new Date(),
});

const organization = { kind: "organization", login: env("KOKLO_GH_ORG_LOGIN") } as const;
const user = { kind: "user", login: env("KOKLO_GH_USER_LOGIN") } as const;

runGitProviderConformance("GitHub réel (bac à sable)", async () => ({
  provider,
  owners: { organization, user },
  installationId: {
    organization: env("KOKLO_GH_ORG_INSTALLATION_ID"),
    user: env("KOKLO_GH_USER_INSTALLATION_ID"),
  },
  userCredentials: {
    token: env("KOKLO_GH_USER_TOKEN"),
    expiresAt: env("KOKLO_GH_USER_TOKEN_EXPIRES_AT"),
  },
  // GitHub calcule `mergeable` en asynchrone ; les déploiements exigent un workflow ; modèles : dépôt marqué is_template.
  capabilities: { deployments: false, mergeableComputed: false, templates: false },
  uniqueName: (name) => {
    const full = `${prefix}-${stamp}-${name}-${++counter}`;
    created.push({ owner: organization.login, name: full });
    return full;
  },
}));

afterAll(async () => {
  const auth = await provider.authenticate({
    installation: { id: env("KOKLO_GH_ORG_INSTALLATION_ID"), owner: organization },
  });
  for (const repo of created) {
    await fetch(`https://api.github.com/repos/${repo.owner}/${repo.name}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${auth.token}`, accept: "application/vnd.github+json" },
    }).catch(() => undefined);
  }
});
