import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Role } from "@koklo/contract";
import { FakeLlm } from "@koklo/domain/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MANAGER_ROLES, SPEC_BATCH_ROLES } from "../src/auth/roles.ts";
import {
  AI_ACTIONS,
  aiApi,
  aiAuditRows,
  BRIEF_REPLY,
  criteriaReply,
  featuresReply,
  installAiBench,
  keyedWorld,
  ROLE_LIST,
  setKey,
} from "./helpers/ai-bench.ts";
import { readScene, seedIndex } from "./helpers/spec-read.ts";
import { createWorld } from "./helpers/tickets.ts";

/**
 * TK-54b : matrice 6 rôles x `ai.*` et `llmCredential.verify` (CDC §14). `ai.*` : SPEC_BATCH_ROLES
 * (le client ne fait que suggérer, le business lit) ; `verify` : MANAGER_ROLES. Un refus ne dépense
 * rien : aucun appel au modèle, aucune ligne d'audit.
 */
const bench = installAiBench({ beforeAll, afterAll, beforeEach });

const AI_ALLOWED: Role[] = ["owner", "admin", "dev", "designer"];
const AI_DENIED: Role[] = ["client", "business"];
const VERIFY_ALLOWED: Role[] = ["owner", "admin"];
const VERIFY_DENIED: Role[] = ["dev", "designer", "client", "business"];

describe("matrice de rôles : constantes", () => {
  it("SPEC_BATCH_ROLES et MANAGER_ROLES sont les ensembles attendus", () => {
    expect([...SPEC_BATCH_ROLES].sort()).toEqual([...AI_ALLOWED].sort());
    expect([...MANAGER_ROLES].sort()).toEqual([...VERIFY_ALLOWED].sort());
    expect([...ROLE_LIST].sort()).toEqual([...AI_ALLOWED, ...AI_DENIED].sort());
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("ai.draftBrief et ai.proposeFeatures : rôles", () => {
  it.each(AI_ALLOWED)("%s : 200 sur les deux procédures", async (role) => {
    const b = bench();
    const { world } = await keyedWorld(b);
    const api = aiApi(b.app, world.actors[role]);

    b.use(FakeLlm.replying(BRIEF_REPLY));
    const brief = await api.draftBrief(world.projectId);
    b.use(FakeLlm.replying(featuresReply()));
    const features = await api.proposeFeatures(world.projectId);

    expect(brief.status, JSON.stringify(brief.body)).toBe(200);
    expect(features.status, JSON.stringify(features.body)).toBe(200);
  });

  it.each(AI_DENIED)(
    "%s : 403 FORBIDDEN, aucun appel au modèle, aucune ligne d'audit",
    async (role) => {
      const b = bench();
      const { world } = await keyedWorld(b);
      const fake = FakeLlm.replying(BRIEF_REPLY);
      b.use(fake);
      const api = aiApi(b.app, world.actors[role]);

      const responses = [
        await api.draftBrief(world.projectId),
        await api.proposeFeatures(world.projectId),
        await api.proposeCriteria(world.projectId),
      ];

      for (const res of responses) {
        expect(res.status, JSON.stringify(res.body)).toBe(403);
        expect(res.body.code).toBe("FORBIDDEN");
      }
      expect(fake.calls).toHaveLength(0);
      expect(await aiAuditRows(b.database, world.organizationId)).toEqual([]);
    },
  );

  it("sans session : 401 UNAUTHORIZED, aucun appel", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    const fake = FakeLlm.replying(BRIEF_REPLY);
    b.use(fake);
    const api = aiApi(b.app, undefined);

    for (const res of [
      await api.draftBrief(world.projectId),
      await api.proposeFeatures(world.projectId),
      await api.proposeCriteria(world.projectId),
      await api.verify(),
    ]) {
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("UNAUTHORIZED");
    }
    expect(fake.calls).toHaveLength(0);
  });
});

describe("ai.proposeCriteria : rôles", () => {
  it.each(AI_ALLOWED)("%s : 200", async (role) => {
    const b = bench();
    const scene = await readScene(b);
    await seedIndex(b, scene, [{ id: "F-001", titre: "Connexion" }], { commit: true });
    await setKey(b.app, scene.world, "FAKE-KEY-NOT-REAL-0101");
    b.use(FakeLlm.replying(criteriaReply()));

    const res = await aiApi(b.app, scene.world.actors[role]).proposeCriteria(scene.projectId);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });
});

describe("llmCredential.verify : rôles", () => {
  it.each(VERIFY_ALLOWED)("%s : 200 { ok: true, model, checkedAt }", async (role) => {
    const b = bench();
    const { world } = await keyedWorld(b);
    b.use(FakeLlm.replying("OK", { servedModel: "modele-servi-9" }));

    const res = await aiApi(b.app, world.actors[role]).verify();

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      model: "modele-servi-9",
      checkedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
  });

  it.each(VERIFY_DENIED)("%s : 403 FORBIDDEN, aucun appel, aucune ligne d'audit", async (role) => {
    const b = bench();
    const { world } = await keyedWorld(b);
    const fake = FakeLlm.replying("OK");
    b.use(fake);

    const res = await aiApi(b.app, world.actors[role]).verify();

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
    expect(fake.calls).toHaveLength(0);
    expect(await aiAuditRows(b.database, world.organizationId)).toEqual([]);
  });

  it("un fournisseur hors de la liste du domaine (fake) est refusé avant tout appel", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    const fake = FakeLlm.replying("OK");
    b.use(fake);

    const res = await aiApi(b.app, world.actors.owner).verify("fake");

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("VALIDATION");
    expect(fake.calls).toHaveLength(0);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("isolation multi-tenant", () => {
  it("le projet d'une autre organisation : 404 NOT_FOUND, ni clé résolue ni appel ni audit", async () => {
    const b = bench();
    const mine = await keyedWorld(b);
    const theirs = await keyedWorld(b);
    const fake = FakeLlm.replying(BRIEF_REPLY);
    b.use(fake);
    const api = aiApi(b.app, mine.world.actors.owner);

    for (const res of [
      await api.draftBrief(theirs.world.projectId),
      await api.proposeFeatures(theirs.world.projectId),
      await api.proposeCriteria(theirs.world.projectId),
    ]) {
      expect(res.status, JSON.stringify(res.body)).toBe(404);
      expect(res.body.code).toBe("NOT_FOUND");
    }
    expect(fake.calls).toHaveLength(0);
    expect(b.provider.keysSeen).toEqual([]);
    expect(await aiAuditRows(b.database, theirs.world.organizationId)).toEqual([]);
    expect(await aiAuditRows(b.database, mine.world.organizationId)).toEqual([]);
  });

  it.each(["admin", "dev", "designer"] as const)(
    "%s : projet d'une autre organisation et projet inexistant donnent le même 404, sans dépense",
    async (role) => {
      const b = bench();
      const mine = await keyedWorld(b);
      const theirs = await keyedWorld(b);
      const fake = FakeLlm.replying(BRIEF_REPLY);
      b.use(fake);
      const api = aiApi(b.app, mine.world.actors[role]);
      const unknownProject = "00000000-0000-4000-8000-000000000000";
      const NOT_FOUND = { code: "NOT_FOUND", message: "Ressource introuvable" };

      for (const projectId of [theirs.world.projectId, unknownProject]) {
        for (const res of [
          await api.draftBrief(projectId),
          await api.proposeFeatures(projectId),
          await api.proposeCriteria(projectId),
        ]) {
          expect(res.status, JSON.stringify(res.body)).toBe(404);
          expect({ code: res.body.code, message: res.body.message }).toEqual(NOT_FOUND);
        }
      }
      expect(fake.calls).toHaveLength(0);
      expect(b.provider.keysSeen).toEqual([]);
      expect(await aiAuditRows(b.database, theirs.world.organizationId)).toEqual([]);
      expect(await aiAuditRows(b.database, mine.world.organizationId)).toEqual([]);
    },
  );

  it("un projet inexistant : 404 NOT_FOUND", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    b.use(FakeLlm.replying(BRIEF_REPLY));

    const res = await aiApi(b.app, world.actors.owner).draftBrief(
      "00000000-0000-4000-8000-000000000000",
    );

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });

  it("la clé d'une autre organisation n'est jamais utilisée : sans clé propre, LLM_NOT_CONFIGURED", async () => {
    const b = bench();
    await keyedWorld(b);
    const world = await createWorld(b.database);
    const fake = FakeLlm.replying(BRIEF_REPLY);
    b.use(fake);

    const res = await aiApi(b.app, world.actors.owner).draftBrief(world.projectId);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("LLM_NOT_CONFIGURED");
    expect(fake.calls).toHaveLength(0);
    expect(b.provider.keysSeen).toEqual([]);
  });

  it("verify n'utilise que la clé de l'organisation de la session", async () => {
    const b = bench();
    const a = await keyedWorld(b);
    const other = await keyedWorld(b);
    b.use(FakeLlm.replying("OK"));

    const res = await aiApi(b.app, a.world.actors.owner).verify();

    expect(res.status).toBe(200);
    expect(b.provider.keysSeen).toEqual([a.key]);
    expect(b.provider.keysSeen).not.toContain(other.key);
    expect(await aiAuditRows(b.database, other.world.organizationId)).toEqual([]);
  });
});

describe("cohérence contrôleur <-> constantes de rôles", () => {
  const read = (path: string) => readFileSync(resolve(import.meta.dirname, path), "utf8");

  it.each(["draftBrief", "proposeFeatures", "proposeCriteria"])(
    "ai.%s : session, garde de rôle et SPEC_BATCH_ROLES, devant l'implémentation",
    (name) => {
      const source = read("../src/ai/ai.controller.ts");
      const at = source.indexOf(`@Implement(contract.ai.${name})`);
      expect(at, `@Implement(contract.ai.${name}) absent du contrôleur`).toBeGreaterThan(-1);
      const decorators = source.slice(Math.max(0, at - 200), at);
      expect(decorators).toContain("@UseGuards(SessionGuard, RoleGuard)");
      expect(decorators).toContain("@Roles(...SPEC_BATCH_ROLES)");
    },
  );

  it("le contrôleur ai n'ouvre aucune procédure à un rôle nommé en dur", () => {
    const source = read("../src/ai/ai.controller.ts");
    expect(source.match(/@Roles\(/g)).toHaveLength(3);
    expect(source).not.toMatch(/@Roles\(\s*"/);
  });

  it("llmCredential.verify : MANAGER_ROLES devant l'implémentation", () => {
    const source = read("../src/llm-credential/llm-credential.controller.ts");
    const at = source.indexOf("@Implement(contract.llmCredential.verify)");
    expect(at).toBeGreaterThan(-1);
    const decorators = source.slice(Math.max(0, at - 200), at);
    expect(decorators).toContain("@UseGuards(SessionGuard, RoleGuard)");
    expect(decorators).toContain("@Roles(...MANAGER_ROLES)");
  });

  it("la matrice de docs/api-contract.md cite les quatre procédures et leurs rôles", () => {
    const doc = read("../../../docs/api-contract.md");
    expect(doc).toContain("0.9.0");
    for (const name of [
      "ai.draftBrief",
      "ai.proposeFeatures",
      "ai.proposeCriteria",
      "llmCredential.verify",
    ]) {
      expect(doc, name).toContain(name);
    }
    expect(AI_ACTIONS.verify).toBe("llm_credential.verify");
  });
});
