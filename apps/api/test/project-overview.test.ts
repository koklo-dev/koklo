import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installAiBench } from "./helpers/ai-bench.ts";
import { clientSpaceApi, seedReview, seedTaggedBaseline } from "./helpers/client-space.ts";
import { pageIdOf, seedIdeaTemplate } from "./helpers/idea.ts";
import { insertMessage, insertProposal } from "./helpers/idea-agent.ts";
import { insertActor } from "./helpers/organizations.ts";
import { keyed, overviewApi } from "./helpers/overview.ts";
import { advanceHead } from "./helpers/reviews.ts";
import { shellApi } from "./helpers/shell.ts";
import { type FeatureSeed, readScene, seedIndex } from "./helpers/spec-read.ts";
import { createWorld, seedSprint, seedTicket, type World } from "./helpers/tickets.ts";

/**
 * TK-92 lot A : `project.overview`, GET /projects/{projectId}/overview. Phase unifiée, prochaine étape,
 * statuts du Fonctionnel, indicateurs, bloc principal, personnes, droits et audience. L'activité a sa suite
 * (`project-overview-activity.test.ts`).
 */
const bench = installAiBench({ beforeAll, afterAll, beforeEach });
const FEATURES: FeatureSeed[] = [
  { id: "F-001", titre: "Connexion" },
  { id: "F-002", titre: "Profil" },
];
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

type Scene = Awaited<ReturnType<typeof readScene>>;
const overviewOf = (
  world: World,
  role: keyof World["actors"] = "owner",
  projectId = world.projectId,
) => overviewApi(bench().app, world.actors[role]).overview(projectId);
const bodyOf = async (scene: Scene | World, role: keyof World["actors"] = "owner") => {
  const world = "world" in scene ? scene.world : scene;
  const res = await overviewOf(world, role);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body;
};

/** Monde clé posée, projet avec dépôt de spec : `features` indexées (aucune si vide). */
async function framingScene(
  options: { features?: FeatureSeed[]; indexedAt?: string; client?: boolean } = {},
) {
  const world = await keyed(bench().app, await createWorld(bench().database));
  if (options.client === false) {
    await bench().database.query("DELETE FROM project_client_access WHERE project_id = $1", [
      world.projectId,
    ]);
  }
  const scene = await readScene(bench(), { world });
  await seedIdeaTemplate(bench().database, scene);
  const { sha } = await seedIndex(bench(), scene, options.features ?? FEATURES, {
    commit: true,
    indexedAt: options.indexedAt ?? hoursAgo(72),
  });
  return { scene, world, sha };
}

/** Tickets du sprint dans l'état voulu : créés par l'API (todo), puis placés en SQL. */
async function seedSprintTickets(world: World, sprintId: string, statuses: string[]) {
  for (const status of statuses) {
    const ticket = await seedTicket(bench().app, world.actors.owner, world.projectId);
    await bench().database.query(
      "UPDATE tickets SET sprint_id = $2, status = $3::ticket_status WHERE id = $1",
      [ticket.id, sprintId, status],
    );
  }
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe("phase unifiée : project.shell, project.overview et clientSpace.projects", () => {
  const phases = async (scene: Scene) => {
    const { world } = scene;
    const shell = (await shellApi(bench().app, world.actors.owner).shell(world.projectId)).body;
    const over = await bodyOf(scene);
    const space = await clientSpaceApi(bench().app, world.actors.client).projects();
    const mine = (space.body as { id: string; phase: string }[]).find(
      (p) => p.id === scene.projectId,
    );
    return { shell: shell.phase, overview: over.phase, client: mine?.phase, over };
  };

  it("sans fonctionnalité ni version : idea (client : framing)", async () => {
    const scene = await readScene(bench());
    await seedIndex(bench(), scene, []);
    const got = await phases(scene);
    expect(got).toMatchObject({ shell: "idea", overview: "idea" });
    expect(got.over.phaseSteps.map((s: { status: string }) => s.status)).toEqual([
      "current",
      "todo",
      "todo",
      "todo",
    ]);
  });

  it("fonctionnalités sans baseline : framing, étape Idée « Non utilisée »", async () => {
    const { scene } = await framingScene();
    const got = await phases(scene);
    expect(got).toMatchObject({ shell: "framing", overview: "framing", client: "framing" });
    expect(got.over.phaseSteps[0]).toEqual({
      key: "idea",
      status: "done",
      subtitle: "Non utilisée",
    });
    expect(got.over.phaseSteps[1].status).toBe("current");
  });

  it("idea-v1 commité sans fonctionnalité : framing, « Version idea-v1 figée le … »", async () => {
    const scene = await readScene(bench(), { world: await createWorld(bench().database) });
    await seedIndex(bench(), scene, []);
    await bench().database.query(
      `INSERT INTO idea_versions (id, organization_id, project_id, number, tag, commit_sha, pages_versions, frozen_at, updated_at)
       VALUES ($1, $2, $3, 1, 'idea-v1', $4, '{}'::jsonb, '2026-11-05T10:00:00Z', now())`,
      [randomUUID(), scene.organizationId, scene.projectId, "a".repeat(40)],
    );
    const got = await phases(scene);
    expect(got).toMatchObject({ shell: "framing", overview: "framing", client: "framing" });
    expect(got.over.phaseSteps[0].subtitle).toBe("Version idea-v1 figée le 5 novembre 2026");
  });

  it("baseline taguée : iterations partout (client : iteration), Baseline 0 posée", async () => {
    const { scene, sha } = await framingScene();
    await seedTaggedBaseline(bench().database, scene, sha);
    const got = await phases(scene);
    expect(got).toMatchObject({ shell: "iterations", overview: "iterations", client: "iteration" });
    expect(got.over.phaseSteps.map((s: { status: string }) => s.status)).toEqual([
      "done",
      "done",
      "done",
      "current",
    ]);
    expect(got.over.phaseSteps[2].subtitle).toMatch(/^Posée le \d{1,2} \p{L}+ 2026$/u);
  });

  it("baseline validée mais pas encore taguée : la même phase pour les trois lectures", async () => {
    const { scene, sha } = await framingScene();
    await seedTaggedBaseline(bench().database, scene, sha);
    await bench().database.query(
      "UPDATE baselines SET status = 'validated', tag_sha = NULL, tagged_at = NULL WHERE project_id = $1",
      [scene.projectId],
    );
    const got = await phases(scene);
    expect(got).toMatchObject({ shell: "iterations", overview: "iterations", client: "iteration" });
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe("prochaine étape : règles servies par le serveur", () => {
  const nextOf = async (world: World, role: keyof World["actors"] = "owner") =>
    (await bodyOf(world, role)).nextAction;

  it("règle 1 : IA non configurée, vue des seuls owner et admin", async () => {
    const world = await createWorld(bench().database);
    await readScene(bench(), { world });
    for (const role of ["owner", "admin"] as const) {
      expect((await nextOf(world, role)).rule, role).toBe("ai_not_configured");
    }
    for (const role of ["dev", "designer", "client", "business"] as const) {
      expect((await nextOf(world, role)).rule, role).not.toBe("ai_not_configured");
    }
    await keyed(bench().app, world);
    expect((await nextOf(world)).rule).not.toBe("ai_not_configured");
  });

  it("règle 2 : spec en échec, vue des seuls owner et admin", async () => {
    const world = await keyed(bench().app, await createWorld(bench().database));
    const scene = await readScene(bench(), { world });
    await seedIndex(bench(), scene, [], { status: "failed", errorCode: "parse" });
    expect((await nextOf(world, "owner")).rule).toBe("spec_failed");
    expect((await nextOf(world, "admin")).rule).toBe("spec_failed");
    expect((await nextOf(world, "dev")).rule).not.toBe("spec_failed");
    expect((await nextOf(world, "client")).rule).toBe("none");
  });

  it("projet neuf : « Commencez le dossier d'idée »", async () => {
    const world = await keyed(bench().app, await createWorld(bench().database));
    const scene = await readScene(bench(), { world });
    await seedIdeaTemplate(bench().database, scene);
    const next = await nextOf(world);
    expect(next).toMatchObject({ rule: "new_project", title: "Commencez le dossier d'idée" });
    expect((await bodyOf(world)).stats).toEqual([]);
  });

  it("règle 3 : propositions en attente, nommées d'après la personne ; vue client distincte", async () => {
    const world = await keyed(bench().app, await createWorld(bench().database));
    const scene = await readScene(bench(), { world });
    await seedIdeaTemplate(bench().database, scene);
    const page = await pageIdOf(bench().database, scene.projectId, "vision");
    await insertMessage(bench().database, scene, { userId: world.actors.client.userId });
    await insertProposal(bench().database, scene, { pageId: page });
    await insertProposal(bench().database, scene, { pageId: page });
    expect((await nextOf(world, "owner")).title).toBe(
      `${world.actors.client.name} a répondu à l'agent : 2 propositions à relire`,
    );
    expect((await nextOf(world, "client")).title).toBe(
      "2 propositions de l'agent attendent votre avis",
    );
    const business = await nextOf(world, "business");
    expect(business).toEqual({
      rule: "none",
      tone: "neutral",
      title: "Rien n'attend votre action.",
      body: "L'équipe travaille sur le dossier d'idée.",
    });
  });

  it("règle 4 : pages requises non stables, bouton nommé d'après la première", async () => {
    const world = await keyed(bench().app, await createWorld(bench().database));
    const scene = await readScene(bench(), { world });
    await seedIdeaTemplate(bench().database, scene);
    await bench().database.query(
      "UPDATE idea_pages SET status = 'draft', content_md = 'x' WHERE project_id = $1 AND slug = 'vision'",
      [scene.projectId],
    );
    const next = await nextOf(world);
    expect(next.rule).toBe("required_pages");
    expect(next.title).toMatch(/^Il reste \d+ pages? requises? à stabiliser$/);
    expect(next.action.label).toMatch(/^Ouvrir /);
    expect((await nextOf(world, "client")).rule).toBe("none");
  });

  it("règle 5 : fonctionnalités en attente depuis plus de 48 h, « Relancer » copie un lien", async () => {
    const { world } = await framingScene({ indexedAt: hoursAgo(49) });
    const next = await nextOf(world);
    expect(next.rule).toBe("validation_overdue");
    expect(next.title).toBe(
      `Le cahier fonctionnel attend la validation de ${world.actors.client.name}`,
    );
    expect(next.action).toMatchObject({
      kind: "copy_link",
      label: `Relancer ${world.actors.client.name.split(" ")[0]}`,
    });
    expect(next.action.href).toBe(`/projects/${world.projectId}/spec/functional`);
    const recent = await framingScene({ indexedAt: hoursAgo(10) });
    expect((await nextOf(recent.world)).rule).toBe("none");
  });

  it("règle 5, vue client : tout de suite, sans « Relancer » ; les règles de l'équipe lui sont fermées", async () => {
    const { world } = await framingScene({ indexedAt: hoursAgo(1) });
    const next = await nextOf(world, "client");
    expect(next.title).toBe("Vous avez 2 fonctionnalités à valider");
    expect(next.action).toBeUndefined();
    expect((await nextOf(world, "business")).rule).toBe("none");
  });

  it("droits : le client ne reçoit aucun lien vers /spec (routes fermées), l'équipe si", async () => {
    const { world } = await framingScene({ indexedAt: hoursAgo(49) });
    const client = await bodyOf(world, "client");
    expect(JSON.stringify(client)).not.toContain("/spec/");
    expect(client.primaryAction).toBeUndefined();
    const team = await bodyOf(world, "owner");
    expect(JSON.stringify(team)).toContain(`/projects/${world.projectId}/spec/functional`);
  });

  it("règle 6 : changements demandés par le client", async () => {
    const { scene, world, sha } = await framingScene();
    await seedReview(bench().database, scene, {
      targetRef: "F-001",
      status: "changes_requested",
      sha,
    });
    await seedReview(bench().database, scene, { targetRef: "F-002", status: "approved", sha });
    const next = await nextOf(world);
    expect(next.rule).toBe("changes_requested");
    expect(next.title).toBe(
      `${world.actors.client.name} demande des changements sur le cahier fonctionnel`,
    );
    expect(next.action.label).toBe("Voir les remarques");
  });

  it("règle 7 : sans client lié, l'équipe valide le cahier fonctionnel", async () => {
    const { world } = await framingScene({ client: false });
    const next = await nextOf(world);
    expect(next.rule).toBe("team_validation");
    expect(next.title).toBe("Le cahier fonctionnel reste à valider par l'équipe");
  });

  it("règle 8 : tickets du sprint actif en revue ; rien d'autre ne se déclenche en Itérations", async () => {
    const { scene, world, sha } = await framingScene();
    await seedTaggedBaseline(bench().database, scene, sha);
    expect((await nextOf(world)).rule).toBe("none");
    const sprint = await seedSprint(bench().app, world.actors.owner, world.projectId);
    await bench().database.query("UPDATE sprints SET status = 'active' WHERE id = $1", [sprint.id]);
    await seedSprintTickets(world, sprint.id, ["in_review", "in_review", "done"]);
    const next = await nextOf(world);
    expect(next.rule).toBe("tickets_in_review");
    expect(next.title).toBe("2 tickets attendent une revue de code");
    expect((await nextOf(world, "client")).body).toBe("L'équipe travaille sur le sprint en cours.");
  });

  it("règles 1 à 9 : la première qui s'applique gagne (IA avant propositions)", async () => {
    const world = await createWorld(bench().database);
    const scene = await readScene(bench(), { world });
    await seedIdeaTemplate(bench().database, scene);
    const page = await pageIdOf(bench().database, scene.projectId, "vision");
    await insertProposal(bench().database, scene, { pageId: page });
    expect((await nextOf(world)).rule).toBe("ai_not_configured");
    expect((await nextOf(world, "dev")).rule).toBe("proposals_pending");
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe("statuts du Fonctionnel, grille des sept livrables et valideur", () => {
  const cardsOf = async (world: World, role: keyof World["actors"] = "owner") => {
    const { main } = await bodyOf(world, role);
    expect(main.kind).toBe("deliverables");
    return main.items as Record<string, unknown>[];
  };
  const functionalOf = async (world: World) => (await cardsOf(world))[0] as Record<string, unknown>;

  it("todo : aucune fonctionnalité ; sept cartes dans l'ordre 21 §0, seul le Fonctionnel disponible", async () => {
    const { world } = await framingScene({ features: [] });
    await bench().database.query("UPDATE idea_pages SET status = 'stable' WHERE project_id = $1", [
      world.projectId,
    ]);
    await bench().database.query(
      `INSERT INTO idea_versions (id, organization_id, project_id, number, tag, commit_sha, pages_versions, frozen_at, updated_at)
       VALUES ($1, $2, $3, 1, 'idea-v1', $4, '{}'::jsonb, now(), now())`,
      [randomUUID(), world.organizationId, world.projectId, "a".repeat(40)],
    );
    const cards = await cardsOf(world);
    expect(cards.map((c) => c.key)).toEqual([
      "functional",
      "data",
      "architecture",
      "technical",
      "security",
      "design",
      "quality",
    ]);
    expect(cards[0]).toMatchObject({
      status: "todo",
      available: true,
      content: "Aucune fonctionnalité",
    });
    for (const card of cards.slice(1)) {
      expect(card).toMatchObject({
        status: "todo",
        available: false,
        content: "Bientôt disponible",
      });
      expect(card.href).toBeUndefined();
    }
  });

  it("pending, revise (prime), validated, puis pending après un changement de SHA", async () => {
    const { scene, world, sha } = await framingScene();
    expect(await functionalOf(world)).toMatchObject({ status: "pending", done: 0, total: 2 });
    await seedReview(bench().database, scene, { targetRef: "F-001", status: "approved", sha });
    expect(await functionalOf(world)).toMatchObject({ status: "pending", done: 1, total: 2 });
    await seedReview(bench().database, scene, {
      targetRef: "F-002",
      status: "changes_requested",
      sha,
    });
    expect(await functionalOf(world)).toMatchObject({ status: "revise", done: 1 });
    await seedReview(bench().database, scene, {
      targetRef: "F-002",
      status: "approved",
      sha,
      createdAt: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(await functionalOf(world)).toMatchObject({
      status: "validated",
      done: 2,
      total: 2,
      progressLabel: "2 fonctionnalités validées sur 2",
      href: `/projects/${world.projectId}/spec/functional`,
    });
    await advanceHead(bench(), scene, FEATURES);
    expect(await functionalOf(world)).toMatchObject({ status: "pending", done: 0 });
  });

  it("valideur avec un client : Fonctionnel et Design par le client", async () => {
    const { world } = await framingScene();
    const cards = await cardsOf(world);
    expect(cards[0]).toMatchObject({
      validator: "client",
      validatorLabel: "Validation client · obligatoire",
    });
    expect(cards[5]).toMatchObject({ key: "design", validator: "client" });
    expect(cards[1]).toMatchObject({
      validator: "team",
      validatorLabel: "Validation de l'équipe · le client lit et commente",
    });
  });

  it("valideur sans client : l'équipe", async () => {
    const { world } = await framingScene({ client: false });
    const cards = await cardsOf(world);
    expect(cards[0]).toMatchObject({
      validator: "team",
      validatorLabel: "Validation par l'équipe",
    });
    expect(cards[1]?.validatorLabel).toBe("Validation de l'équipe");
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe("indicateurs par phase", () => {
  it("Idée : maturité, propositions (zéro affiché), échanges, dernière version ; rien d'absent n'est inventé", async () => {
    const world = await keyed(bench().app, await createWorld(bench().database));
    const scene = await readScene(bench(), { world });
    await seedIdeaTemplate(bench().database, scene);
    await bench().database.query(
      "UPDATE idea_pages SET status = 'stable', content_md = 'x' WHERE project_id = $1 AND slug IN ('vision', 'utilisateurs')",
      [scene.projectId],
    );
    await insertMessage(bench().database, scene, { userId: world.actors.client.userId });
    const { stats } = await bodyOf(world);
    const keys = stats.map((s: { key: string }) => s.key);
    expect(keys).toEqual(["maturity", "proposals", "exchanges"]);
    expect(stats[0]).toMatchObject({
      value: expect.stringMatching(/^2 sur \d+$/),
      gauge: { done: 2 },
    });
    expect(stats[1]).toMatchObject({ value: "0", note: "Aucune en attente" });
    expect(stats[2]).toMatchObject({ value: "1" });
    expect(JSON.stringify(stats)).not.toMatch(/—|null|undefined/);
  });

  it("Cadrage : équipe avec SHA court, client sans SHA ; sans client, cartes du client absentes", async () => {
    const { world, sha } = await framingScene();
    const team = (await bodyOf(world)).stats;
    expect(team.map((s: { key: string }) => s.key)).toEqual([
      "deliverables",
      "validations",
      "suggestions",
      "spec_version",
    ]);
    expect(team[0]).toMatchObject({ value: "0 sur 7", gauge: { done: 0, total: 7 } });
    expect(team[1]).toMatchObject({ value: "2" });
    expect(team[2]).toMatchObject({ value: "0", note: "Aucune en attente" });
    expect(team[3].value).toBe(sha.slice(0, 7));
    const client = (await bodyOf(world, "client")).stats;
    expect(JSON.stringify(client)).not.toContain(sha.slice(0, 7));
    expect(client.map((s: { label: string }) => s.label)).toEqual([
      "Livrables validés",
      "À valider par vous",
      "Vos suggestions",
      "Dernière mise à jour",
    ]);
    const alone = await framingScene({ client: false });
    expect((await bodyOf(alone.world)).stats.map((s: { key: string }) => s.key)).toEqual([
      "deliverables",
      "spec_version",
    ]);
  });

  it("Itérations : la carte Sprint seule ; sans sprint actif, aucune carte", async () => {
    const { scene, world, sha } = await framingScene();
    await seedTaggedBaseline(bench().database, scene, sha);
    expect((await bodyOf(world)).stats).toEqual([]);
    const sprint = await seedSprint(bench().app, world.actors.owner, world.projectId);
    await bench().database.query("UPDATE sprints SET status = 'active' WHERE id = $1", [sprint.id]);
    await seedSprintTickets(world, sprint.id, ["done", "in_progress", "done"]);
    const { stats, main } = await bodyOf(world);
    expect(stats).toEqual([
      {
        key: "sprint",
        icon: "flag",
        label: `Sprint ${sprint.key}`,
        value: "2 sur 3",
        gauge: { done: 2, total: 3 },
        note: "tickets terminés",
      },
    ]);
    expect(main.kind).toBe("sprint");
    expect(main.sprint).toEqual({ key: sprint.key, goal: "Un objectif" });
    expect(main.tickets).toHaveLength(3);
    expect(main.tickets[0].status).toBe("in_progress");
  });
});

describe("bloc principal : Idée et Sprint", () => {
  it("Idée : 5 pages au plus, propositions d'abord, requises non stables ensuite", async () => {
    const world = await keyed(bench().app, await createWorld(bench().database));
    const scene = await readScene(bench(), { world });
    await seedIdeaTemplate(bench().database, scene);
    const page = await pageIdOf(bench().database, scene.projectId, "mesure");
    await insertProposal(bench().database, scene, { pageId: page });
    const { main } = await bodyOf(world);
    expect(main.kind).toBe("idea");
    expect(main.pages).toHaveLength(5);
    expect(main.pages[0]).toMatchObject({ note: "1 proposition de l'agent" });
    expect(
      main.pages.slice(1).every((p: { note: string }) => p.note.startsWith("Page requise")),
    ).toBe(true);
  });

  it("Itérations sans sprint actif : pas de sprint, aucun ticket", async () => {
    const { scene, world, sha } = await framingScene();
    await seedTaggedBaseline(bench().database, scene, sha);
    const { main } = await bodyOf(world);
    expect(main).toEqual({ kind: "sprint", tickets: [] });
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe("personnes, en-tête et droits", () => {
  it("le client d'abord, puis propriétaire, administrateur, développeur, designer ; 5 au plus et « N autres »", async () => {
    const { world } = await framingScene();
    await insertActor(bench().database, world.organizationId, "dev", "dev-bis");
    await insertActor(bench().database, world.organizationId, "dev", "dev-ter");
    const { people } = await bodyOf(world);
    expect(people.items).toHaveLength(5);
    expect(people.items[0]).toMatchObject({
      kind: "client",
      role: "Client · valide le cadrage",
      name: world.actors.client.name,
    });
    expect(people.items.slice(1, 3).map((p: { role: string }) => p.role)).toEqual([
      "Propriétaire",
      "Administrateur",
    ]);
    expect(people.others).toBe(2);
    expect(JSON.stringify(people)).not.toContain("@");
  });

  it("audience et canInvite selon le rôle de la session", async () => {
    const { world } = await framingScene();
    const expected = {
      owner: ["team", true],
      admin: ["team", true],
      dev: ["team", false],
      designer: ["team", false],
      client: ["client", false],
      business: ["client", false],
    } as const;
    for (const [role, [audience, canInvite]] of Object.entries(expected)) {
      const body = await bodyOf(world, role as keyof World["actors"]);
      expect([role, body.audience, body.canInvite]).toEqual([role, audience, canInvite]);
    }
  });

  it("action d'en-tête : jamais un lien que le rôle ne peut pas ouvrir", async () => {
    const { scene, world, sha } = await framingScene();
    expect((await bodyOf(world)).primaryAction).toEqual({
      label: "Continuer le cadrage",
      href: `/projects/${world.projectId}/spec/functional`,
    });
    await seedTaggedBaseline(bench().database, scene, sha);
    expect((await bodyOf(world)).primaryAction).toEqual({
      label: "Ouvrir les tickets",
      href: `/projects/${world.projectId}/tickets`,
    });
    expect((await bodyOf(world, "client")).primaryAction).toBeUndefined();
  });

  it("contenu du client : aucun SHA ni identifiant de dépôt", async () => {
    const { world } = await framingScene();
    for (const role of ["client", "business"] as const) {
      const text = JSON.stringify(await bodyOf(world, role));
      expect(text, role).not.toMatch(/\b[0-9a-f]{40}\b/);
    }
  });

  it("404 uniforme (projet étranger, inconnu, client non lié), 401 sans session, aucune écriture", async () => {
    const { world } = await framingScene();
    const other = await createWorld(bench().database);
    const stranger = await overviewOf(other, "owner", world.projectId);
    const unknown = await overviewOf(other, "owner", randomUUID());
    expect(stranger.status).toBe(404);
    expect({ ...stranger.body, requestId: 0 }).toEqual({ ...unknown.body, requestId: 0 });
    const loner = await insertActor(bench().database, world.organizationId, "client", "loner");
    const unlinked = await overviewApi(bench().app, loner).overview(world.projectId);
    expect(unlinked.status).toBe(404);
    expect((await overviewApi(bench().app, undefined).overview(world.projectId)).status).toBe(401);
    const audit = await bench().database.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM audit_log WHERE organization_id = $1",
      [world.organizationId],
    );
    await overviewOf(world);
    const after = await bench().database.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM audit_log WHERE organization_id = $1",
      [world.organizationId],
    );
    expect(after[0]?.n).toBe(audit[0]?.n);
  });

  it("aucune fuite d'un autre projet ni d'une autre organisation", async () => {
    const a = await framingScene();
    const b = await framingScene();
    await bench().database.query("UPDATE users SET name = $2 WHERE id = $1", [
      b.world.actors.owner.userId,
      "Zorglub Étranger",
    ]);
    const text = JSON.stringify(await bodyOf(a.world));
    expect(text).not.toContain(b.world.projectId);
    expect(text).not.toContain("Zorglub");
  });
});
