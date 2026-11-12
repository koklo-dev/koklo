import { randomUUID } from "node:crypto";
import { FakeLlm } from "@koklo/domain/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AI_BUDGETS } from "../src/ai/ai-budget.ts";
import { installAiBench, keyedWorld } from "./helpers/ai-bench.ts";
import { auditRowsFull } from "./helpers/comments.ts";
import { send } from "./helpers/tickets.ts";

/**
 * TK-101 lot A (B329 d, g, contrat 2.11.0) : `ai.prefillItem`. Texte brut renvoyé au formulaire, jamais écrit : aucune
 * ligne dans `spec_write_batches`, `agent_proposals` ni `agent_launches` ; le moteur partagé pose quota et audit.
 */
const bench = installAiBench({ beforeAll, afterAll, beforeEach });

const VALUES = {
  title: "Annuler une réservation",
  priority: "must",
  description: "Le client annule sa réservation depuis son espace.",
  criteria: [
    {
      title: "Annulation avant l'échéance",
      steps: [
        { type: "etant_donne", text: "une réservation future" },
        { type: "quand", text: "je l'annule" },
        { type: "alors", text: "elle est annulée" },
      ],
    },
  ],
  links: ["R-001", "S-reservations"],
};

const prefill = (
  b: ReturnType<typeof bench>,
  cookie: string | undefined,
  projectId: string,
  over: Record<string, unknown> = {},
) =>
  send(b.app, cookie, "post", `/projects/${projectId}/ai/item/prefill`, {
    projectId,
    type: "feature",
    description: "Annuler une réservation depuis l'espace client",
    ...over,
  });

const COUNTED = ["spec_write_batches", "agent_proposals", "agent_launches"] as const;
const countsOf = async (b: ReturnType<typeof bench>, projectId: string) =>
  Promise.all(
    COUNTED.map(async (table) => {
      const [row] = await b.database.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM ${table} WHERE project_id = $1`,
        [projectId],
      );
      return row?.n;
    }),
  );

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("ai.prefillItem", () => {
  it("200 : les valeurs du modèle, en texte brut ; le prompt cadre la description ; quota et audit posés", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    const fake = FakeLlm.replying(VALUES);
    b.use(fake);

    const res = await prefill(b, world.actors.dev.cookie, world.projectId);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ type: "feature", values: VALUES });
    const [call] = fake.calls;
    expect(call?.trace.purpose).toBe("item-prefill");
    expect(call?.budget).toEqual(AI_BUDGETS["item-prefill"]);
    expect(call?.prompt.user).toContain("Annuler une réservation depuis l'espace client");
    const rows = (await auditRowsFull(b.database, world.organizationId)).filter(
      (r) => r.action === "ai.item.prefill",
    );
    expect(rows).toHaveLength(1);
  });

  it("valeurs partielles : tout est facultatif, un objet vide est accepté", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    b.use(FakeLlm.replying({ title: "Seulement un titre" }));
    const res = await prefill(b, world.actors.dev.cookie, world.projectId);
    expect(res.body).toEqual({ type: "feature", values: { title: "Seulement un titre" } });
    b.use(FakeLlm.replying({}));
    expect((await prefill(b, world.actors.dev.cookie, world.projectId)).body).toEqual({
      type: "feature",
      values: {},
    });
  });

  it("texte avec lien, balise ou caractère de direction : LLM_OUTPUT_INVALID ; hors schéma aussi", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    for (const reply of [
      { ...VALUES, description: "Voir https://exemple.fr" },
      { ...VALUES, title: "<a href=x>clic</a>" },
      { ...VALUES, description: "[x](http://y.fr)" },
      { ...VALUES, description: "texte‮caché" },
      { ...VALUES, extra: "non" },
      { ...VALUES, priority: "urgent" },
    ]) {
      b.use(FakeLlm.replying(reply));
      const res = await prefill(b, world.actors.dev.cookie, world.projectId);
      expect(res.body.code, JSON.stringify(reply)).toBe("LLM_OUTPUT_INVALID");
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
  });

  it("n'écrit rien : aucune ligne dans spec_write_batches, agent_proposals ni agent_launches", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    b.use(FakeLlm.replying(VALUES));
    const before = await countsOf(b, world.projectId);

    expect((await prefill(b, world.actors.dev.cookie, world.projectId)).status).toBe(200);
    b.use(FakeLlm.replying({ ...VALUES, description: "https://x.fr" }));
    expect((await prefill(b, world.actors.dev.cookie, world.projectId)).status).toBe(502);

    expect(await countsOf(b, world.projectId)).toEqual(before);
  });

  it("client et business : 403 sans appel au modèle ni audit ; entrée invalide : 400 ; autre organisation : 404", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    const fake = FakeLlm.replying(VALUES);
    b.use(fake);
    for (const role of ["client", "business"] as const) {
      const res = await prefill(b, world.actors[role].cookie, world.projectId);
      expect(res.status, role).toBe(403);
    }
    const dev = world.actors.dev.cookie;
    for (const over of [{ type: "rule" }, { description: "" }, { description: "x".repeat(501) }]) {
      expect((await prefill(b, dev, world.projectId, over)).status, JSON.stringify(over)).toBe(400);
    }
    // Politique de texte brut sur l'entrée : refus typé (422) avant toute dépense.
    for (const description of ["Voir https://exemple.fr", "<b>gras</b>"]) {
      const res = await prefill(b, dev, world.projectId, { description });
      expect(res.status, description).toBe(422);
      expect(res.body.code, description).toBe("VALIDATION");
    }
    const other = await keyedWorld(b);
    expect((await prefill(b, other.world.actors.dev.cookie, world.projectId)).status).toBe(404);
    expect((await prefill(b, dev, randomUUID())).status).toBe(404);
    expect(fake.calls).toHaveLength(0);
    const rows = (await auditRowsFull(b.database, world.organizationId)).filter(
      (r) => r.action === "ai.item.prefill",
    );
    expect(rows).toHaveLength(0);
  });

  it("quota : le (N+1)-ième appel est refusé en 429 sans nouvelle ligne d'audit", async () => {
    const b = bench();
    const app = await b.makeApp({ limits: { maxCallsPerHourUser: 1, maxCallsPerHourOrg: 100 } });
    const { world } = await keyedWorld(b);
    b.use(FakeLlm.replying(VALUES));
    const call = () =>
      send(app, world.actors.dev.cookie, "post", `/projects/${world.projectId}/ai/item/prefill`, {
        projectId: world.projectId,
        type: "feature",
        description: "Annuler",
      });
    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(429);
    const rows = (await auditRowsFull(b.database, world.organizationId)).filter(
      (r) => r.action === "ai.item.prefill",
    );
    expect(rows).toHaveLength(1);
  });
});
