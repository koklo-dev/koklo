import { randomBytes } from "node:crypto";
import type { TestDatabase } from "@koklo/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Clock } from "../src/clock.ts";
import { createKeyRing } from "../src/crypto/key-ring.ts";
import { DatabaseService } from "../src/database/database.module.ts";
import { LlmCredentialResolver } from "../src/llm-credential/llm-credential.resolver.ts";
import { LlmCredentialService } from "../src/llm-credential/llm-credential.service.ts";
import { PrismaLlmCredentialRepository } from "../src/llm-credential/prisma-llm-credential.repository.ts";
import { configFor, createSeededDatabase } from "./helpers/app.ts";
import { makeSentinel } from "./helpers/llm-credentials.ts";
import { createWorld, type World } from "./helpers/tickets.ts";

/**
 * TK-54b, D7 : compare-and-swap de `invalidate`. `ResolvedLlmCredential.revision` (hex du nonce
 * AES-GCM de la ligne, neuf à chaque `set`) est la valeur attendue ; `invalidate(org, provider,
 * actor, expectedRevision)` ne s'applique que si la ligne n'a pas changé depuis `resolve`. Sans
 * révision attendue, le comportement de TK-52 est inchangé (inconditionnel, idempotent).
 */
let database: TestDatabase;
let databaseService: DatabaseService;
let service: LlmCredentialService;
let resolver: LlmCredentialResolver;
let world: World;
let now = Date.parse("2026-11-01T10:00:00.000Z");
const clock: Clock = {
  now: () => {
    now += 1000;
    return new Date(now).toISOString();
  },
};
const ring = createKeyRing({ current: { version: 1, key: randomBytes(32) }, previous: [] });

beforeAll(async () => {
  database = await createSeededDatabase();
  world = await createWorld(database);
  databaseService = new DatabaseService(
    configFor({ databaseUrl: database.url, appVersion: "dev", appEnv: "test" }),
  );
  const repository = new PrismaLlmCredentialRepository(databaseService);
  service = new LlmCredentialService(repository, ring, clock);
  resolver = new LlmCredentialResolver(repository, ring);
}, 180_000);

afterAll(async () => {
  await databaseService?.onModuleDestroy();
  await database?.dispose();
}, 60_000);

const actor = () => ({ organizationId: world.organizationId, userId: world.actors.dev.userId });
const state = async () =>
  (
    await database.query<{ invalidated_at: Date | null }>(
      "SELECT invalidated_at FROM llm_provider_credentials WHERE organization_id = $1",
      [world.organizationId],
    )
  )[0];
const invalidateAudits = async () =>
  (
    await database.query(
      "SELECT 1 FROM audit_log WHERE organization_id = $1 AND action = 'llm_credential.invalidate'",
      [world.organizationId],
    )
  ).length;
const reset = () => database.query("DELETE FROM llm_provider_credentials");

describe("ResolvedLlmCredential.revision", () => {
  it("est un hexadécimal de 24 caractères (nonce de 12 octets), sans lien avec la clé", async () => {
    await reset();
    const key = makeSentinel();
    await service.set(world.organizationId, "anthropic", { apiKey: key });

    const { revision } = await resolver.resolve(world.organizationId, "anthropic");

    expect(revision).toMatch(/^[0-9a-f]{24}$/);
    expect(revision).not.toContain(key.slice(0, 8));
  });

  it("est stable entre deux résolutions et change à chaque set (rotation)", async () => {
    await reset();
    await service.set(world.organizationId, "anthropic", { apiKey: makeSentinel() });
    const first = await resolver.resolve(world.organizationId, "anthropic");
    const again = await resolver.resolve(world.organizationId, "anthropic");
    await service.set(world.organizationId, "anthropic", { apiKey: makeSentinel() });
    const rotated = await resolver.resolve(world.organizationId, "anthropic");

    expect(again.revision).toBe(first.revision);
    expect(rotated.revision).toMatch(/^[0-9a-f]{24}$/);
    expect(rotated.revision).not.toBe(first.revision);
  });

  it("markUsed ne change pas la révision", async () => {
    await reset();
    await service.set(world.organizationId, "anthropic", { apiKey: makeSentinel() });
    const before = await resolver.resolve(world.organizationId, "anthropic");
    await service.markUsed(world.organizationId, "anthropic");
    const after = await resolver.resolve(world.organizationId, "anthropic");
    expect(before.revision).toMatch(/^[0-9a-f]{24}$/);
    expect(after.revision).toBe(before.revision);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("invalidate avec révision attendue", () => {
  it("révision inchangée : la clé est invalidée, une ligne d'audit", async () => {
    await reset();
    await service.set(world.organizationId, "anthropic", { apiKey: makeSentinel() });
    const { revision } = await resolver.resolve(world.organizationId, "anthropic");
    const audits = await invalidateAudits();

    const status = await service.invalidate(world.organizationId, "anthropic", actor(), revision);

    expect(status?.invalid).toBe(true);
    expect((await state())?.invalidated_at).not.toBeNull();
    expect(await invalidateAudits()).toBe(audits + 1);
  });

  it("clé remplacée entre-temps : rien n'est invalidé, aucun audit, le statut rendu est celui de la NOUVELLE clé", async () => {
    await reset();
    await service.set(world.organizationId, "anthropic", { apiKey: makeSentinel() });
    const { revision } = await resolver.resolve(world.organizationId, "anthropic");
    await service.set(world.organizationId, "anthropic", { apiKey: makeSentinel() });
    const audits = await invalidateAudits();

    const status = await service.invalidate(world.organizationId, "anthropic", actor(), revision);

    expect(status?.invalid).toBe(false);
    expect((await state())?.invalidated_at).toBeNull();
    expect(await invalidateAudits()).toBe(audits);
    // La nouvelle clé reste utilisable.
    await expect(resolver.resolve(world.organizationId, "anthropic")).resolves.toBeDefined();
  });

  it("clé supprimée entre-temps : null, sans erreur", async () => {
    await reset();
    await service.set(world.organizationId, "anthropic", { apiKey: makeSentinel() });
    const { revision } = await resolver.resolve(world.organizationId, "anthropic");
    await service.remove(world.organizationId, "anthropic", actor());

    await expect(
      service.invalidate(world.organizationId, "anthropic", actor(), revision),
    ).resolves.toBeNull();
  });

  it("deux invalidations avec la même révision : la seconde est un no-op (idempotence conservée)", async () => {
    await reset();
    await service.set(world.organizationId, "anthropic", { apiKey: makeSentinel() });
    const { revision } = await resolver.resolve(world.organizationId, "anthropic");
    const audits = await invalidateAudits();

    await service.invalidate(world.organizationId, "anthropic", actor(), revision);
    const first = (await state())?.invalidated_at;
    await service.invalidate(world.organizationId, "anthropic", actor(), revision);

    expect((await state())?.invalidated_at).toEqual(first);
    expect(await invalidateAudits()).toBe(audits + 1);
  });

  it("sans révision attendue : invalidation inconditionnelle comme en TK-52", async () => {
    await reset();
    await service.set(world.organizationId, "anthropic", { apiKey: makeSentinel() });

    const status = await service.invalidate(world.organizationId, "anthropic", actor());

    expect(status?.invalid).toBe(true);
  });

  it("un chemin de course réel : N invalidations conditionnelles concurrentes d'une ancienne révision n'invalident jamais la nouvelle clé", async () => {
    await reset();
    await service.set(world.organizationId, "anthropic", { apiKey: makeSentinel() });
    const { revision } = await resolver.resolve(world.organizationId, "anthropic");
    await service.set(world.organizationId, "anthropic", { apiKey: makeSentinel() });

    await Promise.all(
      Array.from({ length: 8 }, () =>
        service.invalidate(world.organizationId, "anthropic", actor(), revision),
      ),
    );

    expect((await state())?.invalidated_at).toBeNull();
  });
});
