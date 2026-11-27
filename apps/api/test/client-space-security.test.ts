import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installBench } from "./helpers/repo-scene.ts";
import {
  clearedSeeds,
  clientSecurityApi,
  entryEntity,
  securityApi,
  securityScene,
  summaryEntity,
  threatEntity,
} from "./helpers/spec-security.ts";
import { createWorld, insertProject, linkClient } from "./helpers/tickets.ts";

/**
 * TK-117 lot B (cas 5, B800, B801, B803) : résumé vu du client. Vide tant que le livrable n'est pas validé, sans
 * identifiant technique ; contact écrit par le client lié seul, audité sans les valeurs, jamais rendu au rôle business.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });

async function scene() {
  const s = await securityScene(bench(), [
    ...clearedSeeds({
      threats: [threatEntity("SEC-T01", { titre: "Menace secrète" })],
      entries: [
        entryEntity("clientes.telephone", {
          donnee: "Téléphone",
          categorie: "contact",
          conservation: "3 ans",
        }),
        entryEntity("clientes.identifiant"),
      ],
    }),
    summaryEntity(),
  ]);
  const client = s.world.actors.client;
  await linkClient(bench().database, s.organizationId, s.projectId, client.userId);
  const as = (role: keyof typeof s.world.actors) =>
    clientSecurityApi(bench().app, s.world.actors[role]);
  const validate = () =>
    securityApi(bench().app, s.world.actors.owner).validate(s.projectId, s.sha);
  return { s, as, validate };
}
const contact = (projectId: string) =>
  bench().database.query<{ name: string; phone: string; updated_by: string }>(
    "SELECT name, phone, updated_by FROM project_incident_contacts WHERE project_id = $1",
    [projectId],
  );

describe("clientSpace.security", () => {
  it("non validé : rien, pas même le contact", async () => {
    const { s, as } = await scene();
    expect((await as("client").setContact(s.projectId, "Marie", "06 00")).status).toBe(200);
    for (const role of ["client", "business", "dev"] as const) {
      const res = await as(role).get(s.projectId);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body).toEqual({ available: false, validation: "to_validate", cards: [] });
    }
  });

  it("validé : sept cartes sans identifiant, date de validation ; contact au client, jamais au business", async () => {
    const { s, as, validate } = await scene();
    await as("client").setContact(s.projectId, "Marie", "06 00 00 00 00");
    expect((await validate()).status).toBe(200);
    const res = await as("client").get(s.projectId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ available: true, validation: "validated" });
    expect(res.body.cards).toHaveLength(7);
    expect(res.body.cards[4].text).toBe("Téléphone : 3 ans.");
    expect(res.body.validatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(res.body.contact).toEqual({ name: "Marie", phone: "06 00 00 00 00" });
    expect(JSON.stringify(res.body)).not.toMatch(/SEC-T|Menace|clientes\.|security\/|[0-9a-f]{40}/);
    const business = await as("business").get(s.projectId);
    expect(business.body.cards).toHaveLength(7);
    expect(business.body.contact).toBeUndefined();
  });

  it("contact : client lié seul, un contact par projet, audit sans les valeurs", async () => {
    const { s, as } = await scene();
    for (const role of ["owner", "admin", "dev", "designer", "business"] as const) {
      expect((await as(role).setContact(s.projectId, "X", "01")).status, role).toBe(403);
    }
    const client = as("client");
    expect((await client.setContact(s.projectId, "Marie", "06 00 00 00 00")).status).toBe(200);
    expect((await client.setContact(s.projectId, "Paul", "07 00 00 00 00")).status).toBe(200);
    expect(await contact(s.projectId)).toEqual([
      { name: "Paul", phone: "07 00 00 00 00", updated_by: s.world.actors.client.userId },
    ]);
    const audits = await bench().database.query<{ action: string; row: string }>(
      `SELECT action, to_jsonb(audit_log)::text AS row FROM audit_log
        WHERE action = 'security.contact.set' AND project_id = $1`,
      [s.projectId],
    );
    expect(audits).toHaveLength(2);
    expect(audits.map((a) => a.row).join()).not.toMatch(/Marie|Paul|06 00|07 00/);
  });

  it("autre projet ou autre organisation : 404, rien d'écrit", async () => {
    const { s, as } = await scene();
    const other = await insertProject(bench().database, s.organizationId, "Autre");
    expect((await as("client").setContact(other, "Marie", "06")).status).toBe(404);
    expect((await as("client").get(other)).status).toBe(404);
    const foreign = await createWorld(bench().database);
    const intruder = clientSecurityApi(bench().app, foreign.actors.client);
    expect((await intruder.setContact(s.projectId, "Marie", "06")).status).toBe(404);
    expect(await contact(s.projectId)).toHaveLength(0);
    expect(await contact(other)).toHaveLength(0);
  });
});
