import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertProposal } from "./helpers/proposals.ts";
import {
  BRANCH,
  batch,
  batchApi,
  batchRows,
  fileOf,
  filesOf,
  installSpecBench,
  type SpecBench,
  type SpecScene,
  specScene,
  submitOk,
} from "./helpers/spec-batch.ts";

/**
 * TK-114e (B671 à B676) : scénario du staging. Un enregistrement de propositions acceptées refusé en entier par le worker
 * (`write_conflict` : une section existait déjà) laisse les propositions tenues par un lot `conflict`. Le réessai avec
 * `skipConflicts` rejoue ces propositions (B673), n'envoie que celles sans conflit (B671) et remet l'autre « à relire »
 * (B672). TK-114g (B698) : une proposition dont tous les conflits sont `exists` est déjà présente : rejetée, `already_present`,
 * terminale. Intégration : vrai worker, faux fournisseur git.
 */
const bench = installSpecBench({ beforeAll, afterAll, beforeEach });

const SECTION = "Tâches, modèles de tâches et cycle de vie";
const SECTION_ID = "DOC-taches-modeles-de-taches-et-cycle-de-vie";
const component = (name: string, over: Record<string, unknown> = {}) => ({
  kind: "component.create",
  name,
  type: "service",
  zone: "Noyau",
  responsibility: "Fait son travail.",
  serves: ["F-100"],
  ...over,
});
const route = (title: string) => ({
  kind: "flow.create",
  title,
  actor: "Client",
  start: { label: "Ouvrir" },
  steps: [{ label: "Choisir" }],
});
const exchange = (text: string) => ({
  participants: ["C-api", "C-base"],
  messages: [{ from: "C-api", to: "C-base", text, reply: "Données" }],
});
const section = (title: string) => ({ kind: "doc.section.create", title, markdown: "Texte." });

/** Tête `cadrage` du staging : composants, deux flux techniques et la section déjà présente. */
async function stagingHead(b: SpecBench, s: SpecScene) {
  await submitOk(b, s, [
    route("Réserver"),
    route("Payer"),
    component("API"),
    component("Base", { type: "store", serves: [] }),
    { kind: "archflow.create", flow: "P-reserver", ...exchange("Lit") },
    { kind: "archflow.create", flow: "P-payer", ...exchange("Débite") },
    section(SECTION),
  ]);
}

/** Les dix acceptées du lancement d'Architecture, une opération chacune ; la 7e (index 6) est la section en conflit. */
const STAGED = [
  component("Cache"),
  component("File d'attente"),
  { kind: "component.update", specId: "C-api", responsibility: "Sert l'API publique." },
  { kind: "adr.create", title: "PostgreSQL", context: "Une base.", decision: "PostgreSQL 17." },
  { kind: "adr.create", title: "Monolithe", context: "Une app.", decision: "Un déploiement." },
  section("Déploiement"),
  section(SECTION),
  section("Sécurité"),
  { kind: "archflow.update", specId: "P-reserver", ...exchange("Lit tout") },
  { kind: "archflow.update", specId: "P-payer", ...exchange("Débite tout") },
];

async function acceptedProposals(b: SpecBench, s: SpecScene, count: number) {
  const scope = { organizationId: s.world.organizationId, projectId: s.projectId };
  const first = await insertProposal(b.database, scope, { status: "accepted" });
  const ids = [first.id];
  for (let k = 1; k < count; k += 1) {
    const next = await insertProposal(b.database, scope, {
      status: "accepted",
      launchId: first.launchId,
      position: k,
    });
    ids.push(next.id);
  }
  return ids;
}

const proposalRows = (b: SpecBench, ids: string[]) =>
  b.database.query<{
    id: string;
    status: string;
    applied_batch_id: string | null;
    discard_reason: string | null;
  }>(
    "SELECT id, status, applied_batch_id, discard_reason FROM agent_proposals WHERE id = ANY($1::uuid[])",
    [ids],
  );

/** Tête du staging puis le premier enregistrement, refusé en entier par le worker : un lot `conflict` tient les dix. */
async function stagingConflict(b: SpecBench) {
  const s = await specScene(b);
  await stagingHead(b, s);
  const ids = await acceptedProposals(b, s, STAGED.length);
  const api = batchApi(b.app, s.world.actors.dev);
  const first = await api.submit(s.projectId, batch(STAGED, { branch: BRANCH, proposalIds: ids }));
  return { s, ids, api, first };
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: scénario du staging, un test par comportement
describe("specBatch.submit avec skipConflicts (TK-114e)", () => {
  it("sans skipConflicts, comportement inchangé : le worker refuse tout le lot (write_conflict), les dix restent tenues", async () => {
    const b = bench();
    const { s, ids, first } = await stagingConflict(b);
    expect(first.status, JSON.stringify(first.body)).toBe(409);
    expect(first.body.data).toMatchObject({ reason: "write_conflict" });
    expect(first.body.data).not.toHaveProperty("skipped");
    const [, failed] = await batchRows(b.database, s.projectId);
    expect(failed?.status).toBe("conflict");
    const rows = await proposalRows(b, ids);
    expect(rows.every((row) => row.applied_batch_id === failed?.id)).toBe(true);
  });

  it("scénario staging : réessai → lot committed, tout le reste écrit, la section déjà présente rejetée (TK-114g)", async () => {
    const b = bench();
    const { s, ids, api } = await stagingConflict(b);
    const res = await api.submit(
      s.projectId,
      batch(STAGED, { branch: BRANCH, proposalIds: ids, skipConflicts: { proposals: ids } }),
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.status).toBe("committed");
    expect(res.body.skipped).toEqual([
      {
        position: 6,
        kind: "doc.section.create",
        specId: SECTION_ID,
        reason: "exists",
        proposalId: ids[6],
        outcome: "already_present",
      },
    ]);
    expect(res.body.results).toHaveLength(9);
    // ADR-001 et ADR-002 ont été pris par le lot en conflit (un compteur ne rend jamais un numéro) ; 01 : section du gabarit.
    const paths = await filesOf(b, s);
    expect(paths).toEqual(
      expect.arrayContaining([
        "architecture/components/cache.yaml",
        "architecture/components/file-d-attente.yaml",
        "architecture/adr/ADR-003-postgresql.md",
        "architecture/adr/ADR-004-monolithe.md",
        "architecture/overview/03-deploiement.md",
        "architecture/overview/04-securite.md",
      ]),
    );
    expect((await fileOf(b, s, "architecture/components/api.yaml")).content).toContain(
      "Sert l'API publique.",
    );
    expect((await fileOf(b, s, "architecture/flows/P-payer.yaml")).content).toContain(
      "Débite tout",
    );
    const rows = new Map((await proposalRows(b, ids)).map((row) => [row.id, row]));
    expect(rows.get(ids[6] ?? "")).toMatchObject({
      status: "rejected",
      applied_batch_id: null,
      discard_reason: "already_present",
    });
    for (const id of ids.filter((_, k) => k !== 6)) {
      expect(rows.get(id)).toMatchObject({ status: "accepted", applied_batch_id: res.body.id });
    }
    const decisions = await b.database.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM agent_proposal_decisions WHERE proposal_id = $1",
      [ids[6]],
    );
    expect(decisions[0]?.n).toBe(0);
    expect(await batchRows(b.database, s.projectId)).toHaveLength(3);
  });

  it("tout déjà présent : 409 write_conflict avec skipped, aucun lot, la proposition rejetée already_present (TK-114g)", async () => {
    const b = bench();
    const s = await specScene(b);
    await stagingHead(b, s);
    const [id = ""] = await acceptedProposals(b, s, 1);
    const before = (await batchRows(b.database, s.projectId)).length;
    const res = await batchApi(b.app, s.world.actors.dev).submit(
      s.projectId,
      batch([section(SECTION)], {
        branch: BRANCH,
        proposalIds: [id],
        skipConflicts: { proposals: [id] },
      }),
    );
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.code).toBe("SPEC_BATCH_CONFLICT");
    expect(res.body.data).toEqual({
      reason: "write_conflict",
      skipped: [
        {
          position: 0,
          kind: "doc.section.create",
          specId: SECTION_ID,
          reason: "exists",
          proposalId: id,
          outcome: "already_present",
        },
      ],
    });
    expect(await batchRows(b.database, s.projectId)).toHaveLength(before);
    expect((await proposalRows(b, [id]))[0]).toMatchObject({
      status: "rejected",
      applied_batch_id: null,
      discard_reason: "already_present",
    });
  });

  it("TK-114g (B698) : composant modifié disparu (missing) → remis à relire, la nouvelle section part", async () => {
    const b = bench();
    const s = await specScene(b);
    await stagingHead(b, s);
    const [gone = "", fresh = ""] = await acceptedProposals(b, s, 2);
    const operations = [
      { kind: "component.update", specId: "C-disparu", responsibility: "Sert." },
      section("Observabilité"),
    ];
    const res = await batchApi(b.app, s.world.actors.dev).submit(
      s.projectId,
      batch(operations, {
        branch: BRANCH,
        proposalIds: [gone, fresh],
        skipConflicts: { proposals: [gone, fresh] },
      }),
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.skipped).toEqual([
      {
        position: 0,
        kind: "component.update",
        specId: "C-disparu",
        reason: "missing",
        proposalId: gone,
        outcome: "to_review",
      },
    ]);
    const rows = new Map((await proposalRows(b, [gone, fresh])).map((row) => [row.id, row]));
    expect(rows.get(gone)).toMatchObject({
      status: "pending",
      applied_batch_id: null,
      discard_reason: null,
    });
    expect(rows.get(fresh)).toMatchObject({ status: "accepted", applied_batch_id: res.body.id });
  });

  it("skipConflicts de mauvaise longueur ou hors proposalIds : 422 ; proposition tenue par un lot committed : 422", async () => {
    const b = bench();
    const s = await specScene(b);
    const [a = "", c = ""] = await acceptedProposals(b, s, 2);
    const api = batchApi(b.app, s.world.actors.dev);
    const two = [section("Un"), section("Deux")];
    for (const extra of [
      { proposalIds: [a, c], skipConflicts: { proposals: [a] } },
      { proposalIds: [a], skipConflicts: { proposals: [a, c] } },
      { skipConflicts: { proposals: [a, c] } },
    ]) {
      const res = await api.submit(s.projectId, batch(two, { branch: BRANCH, ...extra }));
      expect(res.status, JSON.stringify(extra)).toBe(422);
      expect(res.body.code).toBe("VALIDATION");
    }
    await submitOk(b, s, [section("Un")], { proposalIds: [a] });
    const again = await api.submit(
      s.projectId,
      batch([section("Autre")], {
        branch: BRANCH,
        proposalIds: [a],
        skipConflicts: { proposals: [a] },
      }),
    );
    expect(again.status, JSON.stringify(again.body)).toBe(422);
    expect((await proposalRows(b, [c]))[0]?.applied_batch_id).toBeNull();
  });

  it("abus : les propositions tenues par un lot en conflit d'un AUTRE projet ne se déverrouillent pas (422)", async () => {
    const b = bench();
    const { s, ids } = await stagingConflict(b);
    const [, failed] = await batchRows(b.database, s.projectId);
    const other = await specScene(b);
    const before = (await batchRows(b.database, other.projectId)).length;
    const res = await batchApi(b.app, other.world.actors.dev).submit(
      other.projectId,
      batch(STAGED, { branch: BRANCH, proposalIds: ids, skipConflicts: { proposals: ids } }),
    );
    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(await batchRows(b.database, other.projectId)).toHaveLength(before);
    const rows = await proposalRows(b, ids);
    expect(
      rows.every((row) => row.status === "accepted" && row.applied_batch_id === failed?.id),
    ).toBe(true);
  });

  it("le rejeu de la même clé rend le même lot, sans rien réécrire", async () => {
    const b = bench();
    const { s, ids, api } = await stagingConflict(b);
    const body = batch(STAGED, {
      branch: BRANCH,
      proposalIds: ids,
      skipConflicts: { proposals: ids },
      idempotencyKey: `k-${randomUUID()}-r1`,
    });
    const first = await api.submit(s.projectId, body);
    const replay = await api.submit(s.projectId, body);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(replay.status, JSON.stringify(replay.body)).toBe(200);
    expect(replay.body.id).toBe(first.body.id);
    expect(await batchRows(b.database, s.projectId)).toHaveLength(3);
  });

  it.each(["client", "business"] as const)(
    "%s : 403, aucun lot, aucune remise à relire",
    async (role) => {
      const b = bench();
      const s = await specScene(b);
      const [id = ""] = await acceptedProposals(b, s, 1);
      const res = await batchApi(b.app, s.world.actors[role]).submit(
        s.projectId,
        batch([section("Un")], {
          branch: BRANCH,
          proposalIds: [id],
          skipConflicts: { proposals: [id] },
        }),
      );
      expect(res.status).toBe(403);
      expect(await batchRows(b.database, s.projectId)).toHaveLength(0);
      expect((await proposalRows(b, [id]))[0]).toMatchObject({ status: "accepted" });
    },
  );
});
