import { describe, expect, it } from "vitest";
import { benchOf, ScriptedAi } from "../../test/support/propose-run.ts";
import type { LaunchSources } from "./sources.ts";
import { batchSchema, zonesPass } from "./zones-pass.ts";

/** TK-114b (B615, B617, B618) : une zone par appel, reprise à la première zone non traitée, zone écartée avec son motif. */
const SOURCES: LaunchSources = {
  tag: "architecture",
  pages: [],
  synthesis: null,
  risks: null,
  features: [],
  rules: [],
  roles: [{ specId: "RL-client", title: "Client" }],
  flows: [],
  tableIds: [],
  architecture: { components: [], archflows: [], decisions: [], nfr: [] },
};
const ZONES = ["Achats", "Livraison", "Compte"];

const component = (zone: string) => ({
  kind: "component",
  rationale: "Absent",
  content: { name: `Service ${zone}`, type: "service", zone, responsibility: "Agit." },
});

const zoneOf = (user: string) => ZONES.find((zone) => user.includes(`Zone: ${zone}`)) ?? "";

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("zones-pass (TK-114b)", () => {
  it("batchSchema : specId jamais demandé au modèle (B615) ; un type seul sans anyOf", () => {
    const item = (kinds: Parameters<typeof batchSchema>[0]) =>
      (
        batchSchema(kinds).properties as Record<
          string,
          { items: { properties: Record<string, unknown> } }
        >
      ).proposals?.items.properties;
    const single = item(["component"]);
    expect(JSON.stringify(single?.content)).not.toContain("specId");
    expect(single?.content).not.toHaveProperty("anyOf");
    expect(item(["component", "archflow"])?.content).toHaveProperty("anyOf");
  });

  it("reprend à la première zone non traitée, publie chaque zone puis appelle afterPublish", async () => {
    const ai = new ScriptedAi((_, request) => ({
      output: { proposals: [component(zoneOf(request.prompt.user))] },
    }));
    const { run, store } = benchOf(SOURCES, ai, { progress: { zonesDone: 1 } });
    let after = 0;
    const count = async () => {
      after += 1;
    };
    expect(await zonesPass(run, ZONES, count)).toBe("done");
    expect(ai.requests).toHaveLength(2);
    expect(after).toBe(2);
    expect(store.proposals.map((p) => p.zone)).toEqual(["Livraison", "Compte"]);
    expect(store.state.zonesDone).toBe(2);
  });

  it("sortie refusée : zone écartée avec le motif « refused », la passe continue", async () => {
    const ai = new ScriptedAi((n) => ({
      output: { proposals: [] },
      stop: n === 1 ? "refusal" : "end",
    }));
    const { run, store } = benchOf(SOURCES, ai);
    expect(await zonesPass(run, ZONES, async () => undefined)).toBe("done");
    expect(store.state).toMatchObject({
      zonesDone: 2,
      zonesDiscarded: 1,
      discardReasons: { refused: 1 },
    });
  });

  it("panne hors motif fermé : remonte ; lancement arrêté : stopped ; temps épuisé : handoff sans appel", async () => {
    const broken = new ScriptedAi(() => {
      throw new Error("panne du fournisseur");
    });
    await expect(
      zonesPass(benchOf(SOURCES, broken).run, ZONES, async () => undefined),
    ).rejects.toThrow();
    const ok = new ScriptedAi(() => ({ output: { proposals: [] } }));
    const stopped = benchOf(SOURCES, ok);
    stopped.store.state.status = "cancelled";
    expect(await zonesPass(stopped.run, ZONES, async () => undefined)).toBe("stopped");
    expect(ok.requests).toHaveLength(1);
    const late = new ScriptedAi(() => ({ output: { proposals: [] } }));
    late.clock = 10;
    expect(
      await zonesPass(benchOf(SOURCES, late, { deadlineMs: 1 }).run, ZONES, async () => undefined),
    ).toBe("handoff");
    expect(late.requests).toHaveLength(0);
  });
});
