import { GitProviderUnavailableError } from "@koklo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  callback,
  ENCRYPTION_KEY,
  INSTALL_APP,
  installationBench,
  installScene,
  startState,
} from "./helpers/installations.ts";

/**
 * TK-48a2, AC-48-12 : ni jeton, ni code, ni state, ni identifiant externe dans les journaux, les
 * erreurs, la redirection ou l'audit ; aucune redirection ouverte, quoi que la requête contienne.
 */
const bench = installationBench({ beforeAll, afterAll, beforeEach });

const EVIL = [
  ["next", "//evil.example/steal"],
  ["redirect", "https://evil.example"],
  ["redirect_uri", "https://evil.example/cb"],
  ["return_to", "/\\evil.example"],
  ["url", "javascript:alert(1)"],
  ["result", "installed"],
  ["error_description", "<script>alert(1)</script>"],
] as const;

describe("redirection ouverte impossible", () => {
  it("la cible est fixe pour toute combinaison de paramètres hostiles (succès et refus)", async () => {
    const b = bench();
    const s = await installScene(b);
    const state = await startState(b, s.owner);
    const hostile = Object.fromEntries(EVIL);

    const ok = await callback(b.app, s.owner.cookie, {
      installation_id: s.github.externalId,
      code: `fake-code-${s.login}`,
      state,
      ...hostile,
    });
    const refused = await callback(b.app, s.owner.cookie, { state: "x", ...hostile });
    const anonymous = await callback(b.app, undefined, { state, ...hostile });

    for (const res of [ok, refused, anonymous]) {
      expect(res.status).toBe(303);
      expect(res.headers.location).toMatch(
        /^\/github\?result=(installed|denied|invalid_state|already_linked|provider_error)$/,
      );
      expect(res.text).not.toMatch(/evil|script|javascript/);
    }
  });

  it("la redirection est relative : jamais d'hôte ni de schéma", async () => {
    const b = bench();
    const s = await installScene(b);
    const res = await callback(b.app, s.owner.cookie, { state: "x", host: "evil.example" });
    expect(res.headers.location?.startsWith("/github?")).toBe(true);
    expect(res.headers.location).not.toMatch(/^[a-z]+:|^\/\//i);
  });

  it("un en-tête Host ou X-Forwarded-Host hostile n'influence pas la cible", async () => {
    const b = bench();
    const s = await installScene(b);
    const res = await callback(b.app, s.owner.cookie, { state: "x" })
      .set("X-Forwarded-Host", "evil.example")
      .set("Host", "evil.example");
    expect(res.headers.location).toBe("/github?result=invalid_state");
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe("aucun secret en clair", () => {
  async function leakCase(setup?: (b: ReturnType<typeof bench>, login: string) => void) {
    const b = bench();
    const s = await installScene(b);
    const state = await startState(b, s.owner);
    setup?.(b, s.login);
    const res = await callback(b.app, s.owner.cookie, {
      installation_id: s.github.externalId,
      code: `fake-code-${s.login}`,
      state,
      setup_action: "install",
    });
    return { b, s, state, res };
  }

  const secrets = (ctx: Awaited<ReturnType<typeof leakCase>>) => {
    const exchange = ctx.b.harness.callsOf("exchangeUserCode")[0]?.result as
      | { token: string; refreshToken: string }
      | undefined;
    return [
      ctx.state,
      `fake-code-${ctx.s.login}`,
      ctx.s.github.externalId,
      INSTALL_APP.clientSecret,
      ENCRYPTION_KEY.toString("utf8"),
      exchange?.token,
      exchange?.refreshToken,
    ].filter((v): v is string => typeof v === "string");
  };

  it("succès : ni journaux, ni corps, ni en-têtes de la réponse", async () => {
    const ctx = await leakCase();
    expect(ctx.res.headers.location).toBe("/github?result=installed");
    const haystack = ctx.b.lines.join("\n") + ctx.res.text + JSON.stringify(ctx.res.headers);
    for (const secret of secrets(ctx)) expect(haystack, secret).not.toContain(secret);
  });

  it("succès : ni l'audit ni aucune colonne d'installation/jeton ne contient le jeton ou le code", async () => {
    const ctx = await leakCase();
    const rows = await ctx.b.database.query<{ t: string }>(
      `SELECT row_to_json(a)::text AS t FROM audit_log a WHERE organization_id = $1
       UNION ALL SELECT row_to_json(c)::text FROM provider_user_credentials c WHERE organization_id = $1
       UNION ALL SELECT row_to_json(s)::text FROM provider_auth_states s WHERE organization_id = $1`,
      [ctx.s.world.organizationId],
    );
    const dump = rows.map((r) => r.t).join("\n");
    const exchange = ctx.b.harness.callsOf("exchangeUserCode")[0]?.result as {
      token: string;
      refreshToken: string;
    };
    for (const secret of [
      exchange.token,
      exchange.refreshToken,
      `fake-code-${ctx.s.login}`,
      ctx.s.github.externalId,
      ctx.state,
    ]) {
      expect(dump, secret).not.toContain(secret);
    }
  });

  it("refus (état falsifié, code invalide, panne fournisseur) : mêmes garanties", async () => {
    const forged = await leakCase();
    const bad = bench();
    const s = await installScene(bad);
    const state = await startState(bad, s.owner);
    bad.harness.failWith(
      "exchangeUserCode",
      new GitProviderUnavailableError({
        operation: `exchangeUserCode ${state} fake-code-${s.login}`,
      }),
    );
    const failed = await callback(bad.app, s.owner.cookie, {
      installation_id: s.github.externalId,
      code: `fake-code-${s.login}`,
      state,
    });
    expect(failed.headers.location).toBe("/github?result=provider_error");
    const haystack =
      bad.lines.join("\n") +
      failed.text +
      JSON.stringify(failed.headers) +
      forged.b.lines.join("\n");
    for (const secret of [
      state,
      `fake-code-${s.login}`,
      s.github.externalId,
      INSTALL_APP.clientSecret,
    ]) {
      expect(haystack, secret).not.toContain(secret);
    }
  });

  it("le journal de requêtes n'écrit que le chemin du callback, jamais sa query", async () => {
    const ctx = await leakCase();
    const lines = ctx.b.lines.filter((line) => line.includes("/api/github/callback"));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).not.toContain("?");
      expect(line).not.toMatch(/state=|code=|installation_id=/);
    }
  });
});
