import { GitProviderError, GitProviderUnavailableError } from "@koklo/domain";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installBench, scene } from "./helpers/repo-scene.ts";
import { insertInstallation } from "./helpers/repos.ts";

/**
 * TK-43 CA9 : aucun jeton, aucune clé, aucun identifiant externe dans les réponses, l'OpenAPI,
 * les erreurs, les journaux ni en base. Le journal d'un échec partiel porte `propriétaire/nom` et
 * l'étape (pour réparer l'orphelin), jamais un jeton ni le message brut du fournisseur.
 */
const lines: string[] = [];
const bench = installBench(
  { beforeAll, afterAll, beforeEach },
  { logStream: { write: (line: string) => void lines.push(line) } },
);
beforeEach(() => {
  lines.length = 0;
});

const RAW = "MESSAGE-BRUT-fake-installation-abc";
const USER_TOKEN = "uat-secret-valid";

/** Chaînes qui ne doivent apparaître nulle part : jetons émis par le faux et valeurs de test. */
function secretsOf(b: ReturnType<typeof bench>): string[] {
  const issued = b.harness.callsOf("authenticate").flatMap((call) => {
    const auth = call.result as { token?: string; refreshToken?: string } | undefined;
    return [auth?.token, auth?.refreshToken].filter((v): v is string => typeof v === "string");
  });
  return [...issued, USER_TOKEN, RAW, "-----BEGIN"];
}

async function dump(b: ReturnType<typeof bench>, organizationId: string): Promise<string> {
  const rows = await b.database.query<{ text: string }>(
    `SELECT row_to_json(t)::text AS text FROM project_repos t WHERE organization_id = $1
     UNION ALL SELECT row_to_json(a)::text FROM audit_log a WHERE organization_id = $1
     UNION ALL SELECT row_to_json(i)::text FROM provider_installations i WHERE organization_id = $1`,
    [organizationId],
  );
  return rows.map((row) => row.text).join("\n");
}

describe("CA9 succès : rien de secret dans les réponses, l'OpenAPI, la base et les journaux", () => {
  it("repo.createSpec (organisation) puis repo.list", async () => {
    const b = bench();
    const { world, installation, api } = await scene(b);
    const created = await api.createSpec(world.projectId, installation.id);
    const listed = await api.list(world.projectId);
    const openapi = await request(b.app.getHttpServer()).get("/openapi.json");
    const [row] = await b.database.query<{ external_id: string }>(
      "SELECT external_id FROM project_repos WHERE organization_id = $1",
      [world.organizationId],
    );
    const outputs = JSON.stringify([created.body, listed.body, openapi.body]);
    const database = await dump(b, world.organizationId);

    expect(created.status, outputs).toBe(200);
    for (const secret of secretsOf(b)) {
      expect(outputs, secret).not.toContain(secret);
      expect(database, secret).not.toContain(secret);
      expect(lines.join("\n"), secret).not.toContain(secret);
    }
    for (const hidden of [row?.external_id ?? "", installation.externalId]) {
      expect(hidden.length).toBeGreaterThan(0);
      expect(outputs).not.toContain(hidden);
      expect(JSON.stringify(created.body)).not.toContain("externalId");
    }
  });

  it("compte personnel : le jeton utilisateur ne fuit ni en base ni dans les journaux", async () => {
    const b = bench();
    const base = await scene(b);
    const installation = await insertInstallation(b.database, base.world.organizationId, {
      ownerKind: "user",
      ownerLogin: `octo-${base.installation.ownerLogin}`,
    });
    b.credentials.set(base.world.actors.owner.userId, installation.id, {
      token: USER_TOKEN,
      expiresAt: new Date(Date.parse(b.clock.now()) + 3_600_000).toISOString(),
      refreshToken: "rt-secret-refresh",
    });
    const res = await base.api.createSpec(base.world.projectId, installation.id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const everything = [
      JSON.stringify(res.body),
      lines.join("\n"),
      await dump(b, base.world.organizationId),
    ];
    for (const text of everything) {
      expect(text).not.toContain(USER_TOKEN);
      expect(text).not.toContain("rt-secret-refresh");
    }
  });
});

describe("CA9 erreurs : ni message brut ni jeton, détail utile au journal", () => {
  it("erreur inconnue : 500 INTERNAL sans message du fournisseur, ni dans la réponse ni au journal", async () => {
    const b = bench();
    const { world, installation, api } = await scene(b);
    b.harness.failWith("createRepo", new GitProviderError("createRepo", RAW));
    const res = await api.createSpec(world.projectId, installation.id);
    expect(res.status).toBe(500);
    expect(res.body.code).toBe("INTERNAL");
    expect(res.body.data).toEqual({ requestId: expect.any(String) });
    expect(JSON.stringify(res.body)).not.toContain("MESSAGE-BRUT");
    expect(lines.join("\n")).not.toContain("MESSAGE-BRUT");
    expect(lines.join("\n")).not.toContain("fake-installation");
  });

  it("échec partiel : le journal nomme propriétaire/nom et l'étape, sans jeton", async () => {
    const b = bench();
    const { world, installation, api } = await scene(b);
    b.harness.failWith(
      "writeCommit",
      new GitProviderUnavailableError({ operation: "writeCommit" }),
    );
    const res = await api.createSpec(world.projectId, installation.id);
    expect(res.status).toBe(503);
    const log = lines.join("\n");
    expect(log).toContain(`${installation.ownerLogin}/projet-spec`);
    expect(log).toContain("writeCommit");
    for (const secret of secretsOf(b)) expect(log, secret).not.toContain(secret);
  });
});
