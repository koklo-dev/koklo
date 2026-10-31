import { createMockGitHub, providerOn } from "../support/mock-github.ts";
import { runUserOAuthConformance, type UserGrant } from "./user-oauth-suite.ts";

type Issued = {
  readonly installations: UserGrant["installations"];
  readonly login?: string;
  /** Appartenances : organisation (minuscules) -> rôle et état chez GitHub. */
  readonly memberships?: Readonly<Record<string, { role: string; state: string }>>;
};
const tokenOf = (request: { headers: Readonly<Record<string, string>> }) =>
  (request.headers.authorization ?? "").replace(/^(token|bearer) /i, "");

/**
 * Point d'entrée CI de l'adaptateur Octokit : transport simulé à état minimal. GitHub répond 200
 * avec `error: bad_verification_code` pour un code inconnu ou déjà échangé, et 401 sur
 * `/user/installations` pour un jeton qu'il n'a pas émis.
 */
runUserOAuthConformance("OctokitGitProvider (transport simulé)", async () => {
  let grants = 0;
  const codes = new Map<string, Issued>();
  const tokens = new Map<string, Issued>();
  const mock = createMockGitHub();
  mock.route("POST /login/oauth/access_token", (request) => {
    const code = (request.body as { code?: string }).code ?? "";
    const grant = codes.get(code);
    if (grant === undefined) {
      return { body: { error: "bad_verification_code", error_description: "invalid" } };
    }
    codes.delete(code);
    const token = `ghu_issued_${tokens.size + 1}`;
    tokens.set(token, grant);
    return {
      body: {
        access_token: token,
        token_type: "bearer",
        expires_in: 28_800,
        refresh_token: `ghr_${token}`,
        refresh_token_expires_in: 15_811_200,
      },
    };
  });
  mock.route("GET /user/installations", (request) => {
    const token = (request.headers.authorization ?? "").replace(/^(token|bearer) /i, "");
    const grant = tokens.get(token);
    if (grant === undefined) return { status: 401, body: { message: "Bad credentials" } };
    return {
      body: {
        total_count: grant.installations.length,
        installations: grant.installations.map((installation) => ({
          id: Number(installation.externalId),
          account: {
            login: installation.ownerLogin,
            type: installation.ownerKind === "organization" ? "Organization" : "User",
          },
        })),
      },
    };
  });
  mock.route("GET /user", (request) => {
    const grant = tokens.get(tokenOf(request));
    if (grant === undefined) return { status: 401, body: { message: "Bad credentials" } };
    return { body: { login: grant.login ?? "octo", type: "User" } };
  });
  mock.route("GET /app", { body: { slug: "koklo-test", name: "Koklo Test" } });
  return {
    provider: providerOn(mock),
    redirectUri: "https://app.koklo.test/api/github/callback",
    unknownCode: "code-inconnu-de-github",
    newRoleGrant: async () => {
      grants += 1;
      const login = `Octo-Roles${grants}`;
      const memberships = {
        [`admin-org-${grants}`]: { role: "admin", state: "active" },
        [`member-org-${grants}`]: { role: "member", state: "active" },
        [`pending-org-${grants}`]: { role: "admin", state: "pending" },
      };
      for (const org of [...Object.keys(memberships), `stranger-org-${grants}`]) {
        mock.route(`GET /orgs/${org}/memberships/${login}`, (request) => {
          const grant = tokens.get(tokenOf(request));
          if (grant === undefined) return { status: 401, body: { message: "Bad credentials" } };
          const membership = grant.memberships?.[org];
          return membership === undefined
            ? { status: 404, body: { message: "Not Found" } }
            : { body: { ...membership, organization: { login: org } } };
        });
      }
      const code = `code-roles-${grants}`;
      codes.set(code, { installations: [], login, memberships });
      return {
        code,
        login,
        adminOrg: `admin-org-${grants}`,
        memberOrg: `member-org-${grants}`,
        pendingOrg: `pending-org-${grants}`,
        strangerOrg: `stranger-org-${grants}`,
      };
    },
    newGrant: async () => {
      grants += 1;
      const installations = [
        { externalId: String(7000 + grants), ownerKind: "organization", ownerLogin: "acme" },
        { externalId: String(8000 + grants), ownerKind: "user", ownerLogin: "octo" },
      ] as const;
      const code = `code-${grants}`;
      codes.set(code, { installations });
      return { code, installations };
    },
  };
});
