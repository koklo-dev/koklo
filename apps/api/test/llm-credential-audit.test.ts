import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditRowsFull, UUID_RE } from "./helpers/comments.ts";
import {
  credentialRows,
  llmApi,
  llmBench,
  PROVIDER,
  worldOf,
} from "./helpers/llm-credential-routes.ts";
import { makeSentinel } from "./helpers/llm-credentials.ts";

/**
 * TK-52b : une ligne d'audit par écriture réussie, dans la même transaction, avec le bon type
 * d'action. `targetKind` « llm_credential », `targetId` = id de la ligne, acteur humain de la
 * session. Le journal n'a pas de colonne de détail : ni valeur, ni fournisseur, ni empreinte.
 *  - `llm_credential.create` (premier set), `.replace` (set sur une ligne existante),
 *    `.invalidate`, `.delete` ;
 *  - un refus (403, 404, 422, 503) n'écrit rien ; `list` ne journalise pas ;
 *  - décision : `invalidate` d'une clé déjà invalidée est un no-op idempotent, sans nouvelle ligne
 *    (comme `dependency.add` d'une arête déjà posée).
 */
const bench = llmBench({ beforeAll, afterAll, beforeEach });
const secret = makeSentinel();

const ofKind = async (organizationId: string) =>
  (await auditRowsFull(bench().database, organizationId)).filter(
    (row) => row.target_kind === "llm_credential",
  );

describe("audit des clés BYOK", () => {
  it("set : create la première fois, replace ensuite ; cible = id de la ligne ; acteur humain", async () => {
    const b = bench();
    const world = await worldOf(b);
    const api = llmApi(b.app, world.actors.admin);

    await api.set(PROVIDER, { apiKey: secret });
    const [row] = await credentialRows(b.database, world.organizationId);
    let entries = await ofKind(world.organizationId);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: "llm_credential.create",
      target_kind: "llm_credential",
      target_id: row?.id,
      ticket_id: null,
      actor_kind: "human",
      actor_id: world.actors.admin.userId,
    });
    expect(entries[0]?.target_id).toMatch(UUID_RE);

    await api.set(PROVIDER, { apiKey: `${secret}-bis` });
    entries = await ofKind(world.organizationId);
    expect(entries.map((e) => e.action)).toEqual([
      "llm_credential.create",
      "llm_credential.replace",
    ]);
    expect(entries[1]?.target_id).toBe(row?.id);
  });
});

describe("audit des clés BYOK : invalidate, remove, fournisseurs", () => {
  it("invalidate puis remove : llm_credential.invalidate puis llm_credential.delete, même cible", async () => {
    const b = bench();
    const world = await worldOf(b);
    const api = llmApi(b.app, world.actors.owner);
    await api.set(PROVIDER, { apiKey: secret });
    const [row] = await credentialRows(b.database, world.organizationId);

    expect((await api.invalidate(PROVIDER)).status).toBe(200);
    expect((await api.remove(PROVIDER)).status).toBe(200);

    const entries = await ofKind(world.organizationId);
    expect(entries.map((e) => e.action)).toEqual([
      "llm_credential.create",
      "llm_credential.invalidate",
      "llm_credential.delete",
    ]);
    for (const entry of entries) {
      expect(entry).toMatchObject({
        target_kind: "llm_credential",
        target_id: row?.id,
        actor_kind: "human",
        actor_id: world.actors.owner.userId,
      });
    }
  });

  it("les fournisseurs ont chacun leur cible", async () => {
    const b = bench();
    const world = await worldOf(b);
    const api = llmApi(b.app, world.actors.owner);
    await api.set("anthropic", { apiKey: secret });
    await api.set("openai", { apiKey: secret });
    const entries = await ofKind(world.organizationId);
    expect(new Set(entries.map((e) => e.target_id)).size).toBe(2);
  });
});

describe("audit des clés BYOK : no-op, refus, restitution", () => {
  it("list ne journalise pas", async () => {
    const b = bench();
    const world = await worldOf(b);
    const api = llmApi(b.app, world.actors.owner);
    await api.set(PROVIDER, { apiKey: secret });
    const before = await auditRowsFull(b.database, world.organizationId);
    expect((await api.list()).status).toBe(200);
    expect(await auditRowsFull(b.database, world.organizationId)).toEqual(before);
  });

  it("invalidate répété : un seul événement (no-op idempotent)", async () => {
    const b = bench();
    const world = await worldOf(b);
    const api = llmApi(b.app, world.actors.owner);
    await api.set(PROVIDER, { apiKey: secret });
    await api.invalidate(PROVIDER);
    const before = await auditRowsFull(b.database, world.organizationId);
    expect((await api.invalidate(PROVIDER)).status).toBe(200);
    expect(await auditRowsFull(b.database, world.organizationId)).toEqual(before);
  });

  it("remove ou invalidate d'une clé absente, set invalide : aucune entrée", async () => {
    const b = bench();
    const world = await worldOf(b);
    const api = llmApi(b.app, world.actors.owner);
    expect((await api.remove(PROVIDER)).status).toBe(404);
    expect((await api.invalidate(PROVIDER)).status).toBe(404);
    expect((await api.set(PROVIDER, { apiKey: "" })).status).toBe(422);
    expect((await api.set("fake", { apiKey: secret })).status).toBe(422);
    expect(await auditRowsFull(b.database, world.organizationId)).toEqual([]);
  });
});

describe("audit des clés BYOK : restitution et absence de valeur", () => {
  it("l'entrée est restituée par audit.list (owner), sans ticketKey", async () => {
    const b = bench();
    const world = await worldOf(b);
    await llmApi(b.app, world.actors.owner).set(PROVIDER, { apiKey: secret });
    const { default: request } = await import("supertest");
    const res = await request(b.app.getHttpServer())
      .get("/audit?action=llm_credential.create&limit=100")
      .set("Cookie", world.actors.owner.cookie);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      action: "llm_credential.create",
      targetKind: "llm_credential",
      actorKind: "human",
      actorId: world.actors.owner.userId,
    });
    expect(res.body.items[0]).not.toHaveProperty("ticketKey");
    expect(JSON.stringify(res.body)).not.toContain(secret);
  });

  it("aucune valeur dans le journal : ni clé, ni fragment, ni encodage, ni nom de fournisseur", async () => {
    const b = bench();
    const world = await worldOf(b);
    const api = llmApi(b.app, world.actors.owner);
    await api.set(PROVIDER, { apiKey: secret, defaultModel: "un-modele-distinctif" });
    await api.invalidate(PROVIDER);
    await api.remove(PROVIDER);
    const dump = (
      await b.database.query<{ text: string }>(
        "SELECT row_to_json(a)::text AS text FROM audit_log a WHERE organization_id = $1",
        [world.organizationId],
      )
    )
      .map((row) => row.text)
      .join("\n");
    expect(dump).toContain("llm_credential.create");
    for (const forbidden of [
      secret,
      secret.slice(0, 16),
      secret.slice(-16),
      Buffer.from(secret).toString("base64").slice(4, -4),
      Buffer.from(secret).toString("hex"),
      "un-modele-distinctif",
      "anthropic",
    ]) {
      expect(dump, forbidden).not.toContain(forbidden);
    }
  });
});
