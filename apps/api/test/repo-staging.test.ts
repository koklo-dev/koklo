import { generateKeyPairSync } from "node:crypto";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSeededDatabase, UNREACHABLE_DATABASE_URL } from "./helpers/app.ts";
import { ManualClock } from "./helpers/leases.ts";
import {
  createRepoApp,
  insertInstallation,
  insertProjectRepo,
  projectRepoRows,
  repoApi,
} from "./helpers/repos.ts";
import { createWorld } from "./helpers/tickets.ts";

/**
 * TK-43 CA11 : sans App GitHub (staging actuel), l'API démarre avec GIT_PROVIDER nul ;
 * `repo.createSpec` et `repo.link` répondent 503 PROVIDER_UNAVAILABLE, `repo.list` fonctionne.
 */
const PEM = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
}).privateKey;

let database: TestDatabase;
let staging: INestApplication;
const lines: string[] = [];

beforeAll(async () => {
  database = await createSeededDatabase();
  staging = await createRepoApp(database.url, { clock: new ManualClock() });
});

afterAll(async () => {
  await staging?.close();
  await database?.dispose();
});

describe("CA11 staging sans App : GIT_PROVIDER nul", () => {
  it("le jeton GIT_PROVIDER résout null", async () => {
    const { GIT_PROVIDER } = await import("../src/repo/tokens.ts");
    expect(staging.get(GIT_PROVIDER)).toBeNull();
  });

  it("repo.createSpec et repo.link : 503 PROVIDER_UNAVAILABLE, ni ligne ni audit", async () => {
    const world = await createWorld(database);
    const installation = await insertInstallation(database, world.organizationId);
    const api = repoApi(staging, world.actors.owner);
    const responses = [
      await api.createSpec(world.projectId, installation.id),
      await api.link(world.projectId, installation.id, { ownerLogin: installation.ownerLogin }),
    ];
    for (const res of responses) {
      expect(res.status, JSON.stringify(res.body)).toBe(503);
      expect(res.body.code).toBe("PROVIDER_UNAVAILABLE");
    }
    expect(await projectRepoRows(database, world.organizationId)).toEqual([]);
    const audit = await database.query(
      "SELECT 1 FROM audit_log WHERE organization_id = $1 AND action LIKE 'repo.%'",
      [world.organizationId],
    );
    expect(audit).toEqual([]);
  });

  it("repo.list fonctionne (base seule)", async () => {
    const world = await createWorld(database);
    const installation = await insertInstallation(database, world.organizationId);
    const id = await insertProjectRepo(
      database,
      world.organizationId,
      world.projectId,
      installation.id,
    );
    const res = await repoApi(staging, world.actors.dev).list(world.projectId);
    expect(res.status).toBe(200);
    expect(res.body.map((repo: { id: string }) => repo.id)).toEqual([id]);
  });

  it("les contrôles d'accès précèdent le 503 : 403 puis 404", async () => {
    const world = await createWorld(database);
    const other = await createWorld(database);
    const installation = await insertInstallation(database, world.organizationId);
    const denied = await repoApi(staging, world.actors.client).createSpec(
      world.projectId,
      installation.id,
    );
    expect(denied.body.code).toBe("FORBIDDEN");
    const missing = await repoApi(staging, world.actors.owner).createSpec(
      other.projectId,
      installation.id,
    );
    expect(missing.body.code).toBe("NOT_FOUND");
  });
});

describe("câblage du fournisseur selon la configuration", () => {
  it("avec l'App configurée : l'adaptateur Octokit, jamais le faux", async () => {
    const { GIT_PROVIDER } = await import("../src/repo/tokens.ts");
    const { OctokitGitProvider } = await import("@koklo/github");
    const { InMemoryGitProvider } = await import("@koklo/github/testing");
    const app = await createRepoApp(UNREACHABLE_DATABASE_URL, {
      githubApp: { appId: "123456", privateKey: PEM, clientId: "Iv1.x", clientSecret: "secret-x" },
    });
    try {
      const provider = app.get(GIT_PROVIDER);
      expect(provider).toBeInstanceOf(OctokitGitProvider);
      expect(provider).not.toBeInstanceOf(InMemoryGitProvider);
    } finally {
      await app.close();
    }
  });

  it("sans App : un seul avertissement au démarrage, sans aucune valeur", async () => {
    lines.length = 0;
    const app = await createRepoApp(UNREACHABLE_DATABASE_URL, {
      logStream: { write: (line: string) => void lines.push(line) },
    });
    await app.close();
    const warnings = lines
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as { level: number; msg?: string }];
        } catch {
          return [];
        }
      })
      .filter((entry) => entry.level === 40 && /GITHUB_APP/.test(entry.msg ?? ""));
    expect(warnings).toHaveLength(1);
  });
});
