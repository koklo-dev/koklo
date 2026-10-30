import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { contract } from "@koklo/contract";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSeededDatabase } from "./helpers/app.ts";
import { auditRowsFull, commentRows, commentsFor } from "./helpers/comments.ts";
import { createAppWithClock, ManualClock } from "./helpers/leases.ts";
import { createWorld, seedTicket, send } from "./helpers/tickets.ts";

/** TK-32, critère 1 : « le journal refuse toute modification » (C1a base, C1b API, C1c code, C1d atomicité). */
let database: TestDatabase;
let app: INestApplication;

beforeAll(async () => {
  database = await createSeededDatabase();
  app = await createAppWithClock(database.url, new ManualClock());
  await database.query("CREATE TABLE audit_fail (action text PRIMARY KEY)");
  await database.query(`
    CREATE FUNCTION audit_fail_guard() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF EXISTS (SELECT 1 FROM audit_fail WHERE action = NEW.action) THEN
        RAISE EXCEPTION 'audit refusé pour le test: %', NEW.action;
      END IF;
      RETURN NEW;
    END $$`);
  await database.query(
    "CREATE TRIGGER audit_fail_trigger BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_fail_guard()",
  );
});

beforeEach(async () => {
  await database.query("DELETE FROM audit_fail");
});

afterAll(async () => {
  await app?.close();
  await database?.dispose();
});

async function sqlState(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

const RESTRICT_VIOLATION = "23001";

describe("C1a : la base refuse de modifier une entrée produite par l'API", () => {
  it("UPDATE (une ligne puis toutes), DELETE et TRUNCATE sont refusés, les lignes restent intactes", async () => {
    const world = await createWorld(database);
    await seedTicket(app, world.actors.dev);
    const before = await auditRowsFull(database, world.organizationId);
    expect(before.map((r) => r.action)).toEqual(["ticket.create"]);

    const one = await sqlState(() =>
      database.query("UPDATE audit_log SET action = 'falsifié' WHERE id = $1", [before[0]?.id]),
    );
    const all = await sqlState(() => database.query("UPDATE audit_log SET actor_id = 'x'"));
    const remove = await sqlState(() =>
      database.query("DELETE FROM audit_log WHERE organization_id = $1", [world.organizationId]),
    );
    const removeAll = await sqlState(() => database.query("DELETE FROM audit_log"));
    const truncate = await sqlState(() => database.query("TRUNCATE audit_log"));

    expect([one, all, remove, removeAll, truncate]).toEqual(Array(5).fill(RESTRICT_VIOLATION));
    expect(await auditRowsFull(database, world.organizationId)).toEqual(before);
  });
});

describe("C1b : aucune route d'écriture sur /audit", () => {
  it("le groupe audit du contrat n'expose que list, en GET", () => {
    expect(Object.keys(contract.audit)).toEqual(["list"]);
    type Procedure = { "~orpc": { meta: { "~openapi"?: { method?: string; path?: string } } } };
    const procedures = Object.values(contract).flatMap((entry) =>
      "~orpc" in entry
        ? [entry as unknown as Procedure]
        : Object.values(entry as unknown as Record<string, Procedure>),
    );
    const onAudit = procedures
      .map((procedure) => procedure["~orpc"].meta["~openapi"])
      .filter((meta) => meta?.path?.startsWith("/audit"));
    expect(onAudit).toEqual([{ method: "GET", path: "/audit" }]);
  });

  it("POST, PUT, PATCH et DELETE sur /audit et /audit/{id} répondent 404 ou 405 et ne modifient rien", async () => {
    const world = await createWorld(database);
    await seedTicket(app, world.actors.dev);
    const before = await auditRowsFull(database, world.organizationId);
    const [target] = before;
    const cookie = world.actors.owner.cookie;
    const server = app.getHttpServer();

    const responses = [
      await send(app, cookie, "post", "/audit", { action: "x" }),
      await send(app, cookie, "patch", `/audit/${target?.id}`, { action: "x" }),
      await send(app, cookie, "delete", `/audit/${target?.id}`),
      await send(app, cookie, "delete", "/audit"),
      await request(server).put("/audit").set("Cookie", cookie).send({ action: "x" }),
      await request(server).put(`/audit/${target?.id}`).set("Cookie", cookie).send({}),
      await send(app, cookie, "post", `/audit/${target?.id}`, {}),
    ];

    for (const response of responses) {
      expect([404, 405]).toContain(response.status);
    }
    expect(await auditRowsFull(database, world.organizationId)).toEqual(before);
  });
});

describe("C1c : aucun code de l'api ne modifie le journal", () => {
  const srcRoot = fileURLToPath(new URL("../src/", import.meta.url));

  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        return sources(path);
      }
      return path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : [];
    });
  }
  const strip = (code: string) =>
    code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const files = sources(srcRoot).map((path) => ({
    file: relative(srcRoot, path),
    code: strip(readFileSync(path, "utf8")),
  }));

  it("aucun auditLog.update / updateMany / upsert / delete / deleteMany dans apps/api/src", () => {
    const offenders = files
      .filter(({ code }) =>
        /\bauditLog\s*\.\s*(update|updateMany|upsert|delete|deleteMany)\b/.test(code),
      )
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("aucun SQL brut ne touche audit_log", () => {
    const offenders = files
      .filter(
        ({ code }) => /audit_log/i.test(code) && /\$(query|execute)Raw|Prisma\.sql/.test(code),
      )
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("seul tracker/audit.ts appelle auditLog.create", () => {
    const creators = files
      .filter(({ code }) => /\bauditLog\s*\.\s*create(Many)?\b/.test(code))
      .map(({ file }) => file);
    expect(creators).toEqual(["tracker/audit.ts"]);
  });

  it("le module audit existe et ne fait que des lectures (findMany / findFirst)", () => {
    const auditModule = files.filter(({ file }) => file.startsWith("audit/"));
    expect(auditModule.length, "apps/api/src/audit/ doit exister").toBeGreaterThan(0);
    const calls = auditModule.flatMap(({ code }) =>
      [...code.matchAll(/\bauditLog\s*\.\s*(\w+)/g)].map((match) => match[1]),
    );
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((call) => call === "findMany" || call === "findFirst")).toBe(true);
  });
});

describe("C1d : atomicité de l'audit avec l'écriture", () => {
  it("comment.create : si l'audit échoue, aucun commentaire n'est créé (500 INTERNAL)", async () => {
    const world = await createWorld(database);
    const ticket = await seedTicket(app, world.actors.dev);
    await database.query("INSERT INTO audit_fail VALUES ('comment.create')");

    const response = await commentsFor(app, world.actors.dev).create(ticket.id);

    expect(response.status).toBe(500);
    expect(response.body.code).toBe("INTERNAL");
    expect(await commentRows(database, world.organizationId)).toHaveLength(0);
  });

  it("comment.delete : si l'audit échoue, le commentaire n'est pas supprimé", async () => {
    const world = await createWorld(database);
    const ticket = await seedTicket(app, world.actors.dev);
    const dev = commentsFor(app, world.actors.dev);
    const comment = (await dev.create(ticket.id)).body;
    await database.query("INSERT INTO audit_fail VALUES ('comment.delete')");

    const response = await dev.remove(comment.id);

    expect(response.status).toBe(500);
    expect((await commentRows(database, world.organizationId))[0]?.deleted_at).toBeNull();
    expect((await dev.list(ticket.id)).body.items).toHaveLength(1);
  });

  it("une écriture refusée (droit, cible, validation) ne laisse aucune entrée de commentaire", async () => {
    const world = await createWorld(database);
    const ticket = await seedTicket(app, world.actors.dev);
    const before = await auditRowsFull(database, world.organizationId);

    const refused = [
      await commentsFor(app, world.actors.business).create(ticket.id),
      await commentsFor(app, world.actors.dev).create("pas-un-uuid"),
      await commentsFor(app, world.actors.dev).create(ticket.id, ""),
      await commentsFor(app, world.actors.dev).remove("00000000-0000-4000-8000-000000000002"),
    ];

    expect(refused.map((r) => r.status === 403 || r.status === 404 || r.status === 422)).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(refused.map((r) => r.body.code)).toEqual([
      "FORBIDDEN",
      "VALIDATION",
      expect.stringMatching(/^(VALIDATION|BAD_REQUEST)$/),
      "NOT_FOUND",
    ]);
    expect(await auditRowsFull(database, world.organizationId)).toHaveLength(before.length);
    expect(await commentRows(database, world.organizationId)).toHaveLength(0);
  });
});
