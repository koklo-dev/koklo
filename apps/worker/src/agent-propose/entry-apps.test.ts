import { describe, expect, it } from "vitest";
import { benchOf, type Reply, ScriptedAi } from "../../test/support/propose-run.ts";
import {
  TOTO_APPS,
  TOTO_DATABASE,
  TOTO_ROLES,
  TOTO_SERVICES,
  TOTO_SOURCES,
} from "../../test/support/toto.ts";
import { coverageIndexOf } from "./coverage.ts";
import { coveragePass } from "./coverage-pass.ts";
import { entriesOf, entryActorsPlan, rolePacketsOf } from "./entry-apps.ts";
import { architectureEnd } from "./generate.ts";
import type { LaunchSources } from "./sources.ts";

/**
 * TK-114d (B653, B658) : rôles sans application d'entrée, dans le même appel que la couverture. Faux moteur sur les sources
 * de Toto : 5 rôles sans application, 2 applications isolées, 22 flux qui appellent directement un service.
 */
const [ECRAN, PAGE] = TOTO_APPS as [string, string];
const [SERVICE_1, SERVICE_2] = TOTO_SERVICES as [string, string];

const consoleApp = (over: Record<string, unknown> = {}) => ({
  kind: "component",
  rationale: "Le gestionnaire et le visiteur n'ont pas d'application",
  content: {
    name: "Console de gestion",
    type: "app",
    zone: "Comptes",
    responsibility: "Accueille le gestionnaire et le visiteur.",
    actors: ["RL-gestionnaire", "RL-visiteur", "RL-fantome", "RL-gestionnaire"],
    dependsOn: [{ to: SERVICE_1, via: "HTTP" }],
    ...over,
  },
});

/** Réponse de Toto : entrées vers les applications connues, une application proposée, des liens (dont un cycle). */
const TOTO_REPLY: Reply = {
  output: {
    assignments: [],
    entries: [
      { role: "RL-colocataire", component: ECRAN },
      { role: "RL-admin-colocation", component: ECRAN },
      { role: "RL-invite", component: PAGE },
      { role: "RL-invite", component: ECRAN },
      { role: "RL-visiteur", component: SERVICE_1 },
      { role: "RL-fantome", component: PAGE },
      "RL-colocataire",
    ],
    proposals: [
      consoleApp(),
      {
        kind: "component",
        rationale: "Relevés absents",
        content: {
          name: "Service des relevés",
          type: "service",
          zone: "Dépenses",
          responsibility: "Calcule les relevés.",
          actors: ["RL-visiteur"],
          dependsOn: [{ to: TOTO_DATABASE, via: "SQL" }],
        },
      },
    ],
    links: [
      { from: ECRAN, to: SERVICE_1, via: "HTTP", async: false },
      { from: SERVICE_1, to: ECRAN, via: "HTTP", async: false },
      { from: PAGE, to: SERVICE_2, via: "HTTP", async: false },
    ],
  },
};

const EMPTY: Reply = { output: { assignments: [], proposals: [], entries: [] } };

function passOf(sources: LaunchSources, reply: Reply) {
  const ai = new ScriptedAi((n) => (n === 1 ? reply : EMPTY));
  const bench = benchOf(sources, ai);
  const index = coverageIndexOf(sources);
  return { ...bench, index, pass: coveragePass(bench.run, index) };
}

const byTitle = (proposals: readonly { title: string; payload: Record<string, unknown> }[]) =>
  Object.fromEntries(proposals.map((p) => [p.title, p.payload]));

describe("entriesOf et entryActorsPlan (B653)", () => {
  it("entrées bien formées ; rôle du paquet une fois ; cible app où l'ajout s'écrit", () => {
    const entries = entriesOf([
      { role: "RL-a", component: "C-app" },
      { role: "RL-a", component: "C-autre-app" },
      { role: "RL-b", component: "C-service" },
      { role: "RL-c", component: "C-decidee" },
      { role: "RL-z", component: "C-app" },
      { role: 1, component: "C-app" },
    ]);
    expect(entries).toHaveLength(5);
    const types: Record<string, string> = {
      "C-app": "app",
      "C-autre-app": "app",
      "C-service": "service",
      "C-decidee": "app",
    };
    const packet = {
      features: [],
      flows: [],
      components: [],
      roles: ["RL-a", "RL-b", "RL-c"].map((specId) => ({ specId, title: specId, calls: [] })),
    };
    const plan = entryActorsPlan(entries, packet, {
      typeOf: (id) => types[id],
      writable: (id) => id !== "C-decidee",
    });
    expect([...plan]).toEqual([["C-app", ["RL-a"]]]);
    expect(entriesOf("x")).toEqual([]);
  });

  it("rolePacketsOf : chaque rôle avec les services que ses flux appellent directement", () => {
    const packets = rolePacketsOf(coverageIndexOf(TOTO_SOURCES), []);
    expect(packets.map((p) => p.specId)).toEqual(TOTO_ROLES.map((r) => r.specId));
    expect(packets[0]).toEqual({
      specId: "RL-colocataire",
      title: "Colocataire",
      calls: [SERVICE_1, TOTO_SERVICES[5], TOTO_SERVICES[10], TOTO_SERVICES[15], TOTO_SERVICES[1]],
    });
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même passe, un test par comportement
describe("passe des applications, faux moteur Toto (B653, B658)", () => {
  it("au plus 5 rôles par paquet : le bloc des rôles sans application est une donnée, avec les services appelés", async () => {
    const extra = [6, 7].map((n) => ({ specId: `RL-role-${n}`, title: `Rôle ${n}` }));
    const sources = { ...TOTO_SOURCES, roles: [...TOTO_ROLES, ...extra] };
    const { ai, pass } = passOf(sources, EMPTY);
    await pass;
    const first = ai.requests[0]?.prompt.user ?? "";
    const block = first.split("Roles without an entry application")[1]?.split("<<<END")[0] ?? "";
    const lines = block.split("\n").filter((line) => line.startsWith("RL-"));
    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe(
      `RL-colocataire | Colocataire | ${[SERVICE_1, TOTO_SERVICES[5], TOTO_SERVICES[10], TOTO_SERVICES[15], TOTO_SERVICES[1]].join(", ")}`,
    );
    const second = ai.requests[1]?.prompt.user ?? "";
    expect(second).toContain("RL-role-6 | Rôle 6 | none");
  });

  it("entries et app proposée avec actors : 5/5 ; non-app, rôle hors paquet, rôle inconnu, actors d'un service : retirés", async () => {
    const { store, pass } = passOf(TOTO_SOURCES, TOTO_REPLY);
    expect(await pass).toBe("completed");
    const payloads = byTitle(store.proposals);
    expect(payloads["Écran Liste de courses"]).toMatchObject({
      specId: ECRAN,
      type: "app",
      actors: ["RL-colocataire", "RL-admin-colocation"],
      dependsOn: [{ to: SERVICE_1, via: "HTTP" }],
    });
    expect(payloads["Page de transparence"]).toMatchObject({ specId: PAGE, actors: ["RL-invite"] });
    expect(payloads["Console de gestion"]?.actors).toEqual(["RL-gestionnaire", "RL-visiteur"]);
    expect(payloads["Service des relevés"]).not.toHaveProperty("actors");
    expect(JSON.stringify(store.proposals)).not.toContain("RL-fantome");
    expect(store.state.coverageAfter?.roles).toEqual({ covered: 5, total: 5 });
  });

  it("liens app → service : un lien synchrone qui fermerait un cycle est refusé", async () => {
    const { store, pass } = passOf(TOTO_SOURCES, TOTO_REPLY);
    await pass;
    const service = store.proposals.find((p) => p.payload.specId === SERVICE_1);
    expect(service).toBeUndefined();
  });

  it("flux de la réponse réécrit avant publication quand le rôle a une application (B658) ; specId du modèle écarté", async () => {
    const flow = (specId?: string) => ({
      kind: "archflow",
      rationale: "Flux à détailler",
      content: {
        ...(specId === undefined ? {} : { specId }),
        flow: "P-nouveau",
        participants: ["RL-colocataire", SERVICE_1],
        messages: [{ from: "RL-colocataire", to: SERVICE_1, text: "Ajoute", reply: "Ajouté" }],
      },
    });
    const sources = {
      ...TOTO_SOURCES,
      flows: [...TOTO_SOURCES.flows, { specId: "P-nouveau", title: "Nouveau" }],
    };
    const output = TOTO_REPLY.output as Record<string, unknown[]>;
    const reply = {
      output: { ...output, proposals: [...(output.proposals ?? []), flow("P-x"), flow()] },
    };
    const { store, pass } = passOf(sources, reply);
    await pass;
    const flows = store.proposals.filter((p) => p.kind === "archflow");
    expect(flows).toHaveLength(1);
    expect(flows[0]?.payload).toEqual({
      flow: "P-nouveau",
      participants: ["RL-colocataire", ECRAN, SERVICE_1],
      messages: [
        { from: "RL-colocataire", to: ECRAN, text: "Ajoute", reply: "Ajouté" },
        { from: ECRAN, to: SERVICE_1, text: "Ajoute", reply: "Ajouté" },
      ],
    });
  });

  it("Toto fini : rôles 5/5, flux repris 22/22, arrêt completed (B656, B660)", async () => {
    const { store, run, index, pass } = passOf(TOTO_SOURCES, TOTO_REPLY);
    expect(await architectureEnd(run, index, await pass)).toBe("completed");
    expect(store.state.coverageAfter).toMatchObject({
      roles: { covered: 5, total: 5 },
      reprises: { covered: 22, total: 22 },
      links: { covered: 24, total: 24 },
    });
    expect(store.state.coverageAfter?.reprises).not.toHaveProperty("skipped");
  });
});
