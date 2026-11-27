import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { batchRows, installSpecBench, operationRows } from "./helpers/spec-batch.ts";
import { entryEntity, securityApi, securityScene, tableEntity } from "./helpers/spec-security.ts";
import { environmentsEntity, stackEntity } from "./helpers/spec-technical.ts";

/**
 * TK-117 lot B (cas 6, B795, B808, B809) : données sensibles. Une ligne par entrée classée et une par champ non classé,
 * filtres, recherche, `around`, contexte du cahier technique, registre RGPD échappé, « Classer » par un lot.
 */
const bench = installSpecBench({ beforeAll, afterAll, beforeEach }, { waitMs: 200 });
// Worker arrêté : le lot reste en file, ses opérations sont lues telles que l'API les a enregistrées.
beforeEach(async () => bench().stopWorker());

const FIELDS = Array.from({ length: 56 }, (_, i) => `c${String(i + 1).padStart(2, "0")}`);
const SEEDS = () => [
  tableEntity("clientes", ["nom", "telephone", "note"]),
  tableEntity("volume", FIELDS),
  entryEntity("clientes.nom", {
    donnee: "Nom | <b>prénom</b>",
    categorie: "personnelle",
    conservation: "3 ans après le dernier rendez-vous",
    acces: ["Accueil", "Gérante"],
    transferts: "Aucun transfert hors de l'Union européenne.",
  }),
  entryEntity("clientes.telephone", {
    donnee: "Téléphone",
    categorie: "contact",
    conservation_proposee: "3 ans",
    transferts: "Aucun transfert hors de l'Union européenne.",
  }),
  environmentsEntity(),
  stackEntity("ST-sms", { statut: "choisi", choix: "Prestataire SMS" }),
];

const read = async () => {
  const s = await securityScene(bench(), SEEDS());
  return { s, api: securityApi(bench().app, s.world.actors.dev) };
};
const fields = (body: { items: { field: string }[] }) => body.items.map((item) => item.field);

describe("security.data.list", () => {
  it("pages de 50, états des lignes, comptes et contexte du cahier technique", async () => {
    const { s, api } = await read();
    const res = await api.data(s.projectId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.items).toHaveLength(50);
    expect(res.body.total).toBe(59);
    expect(res.body.items[0]).toMatchObject({
      field: "clientes.nom",
      category: "personal",
      status: "classified",
      retention: "3 ans après le dernier rendez-vous",
      access: ["Accueil", "Gérante"],
    });
    expect(res.body.items[1]).toMatchObject({
      field: "clientes.note",
      status: "unclassified",
      fields: ["clientes.note"],
    });
    expect(res.body.items[2]).toMatchObject({
      field: "clientes.telephone",
      status: "undecided",
      retentionSuggestion: "3 ans",
    });
    expect(res.body.items[2].retention).toBeUndefined();
    expect(res.body.facets.status).toEqual({
      total: 59,
      classified: 2,
      unclassified: 57,
      undecided: 1,
    });
    expect(res.body.facets.category).toEqual({ personal: 1, contact: 1 });
    expect(res.body.context).toEqual({
      hosting: ["Poste du développeur", "Hébergeur, Paris"],
      subprocessors: ["Prestataire SMS (Fournisseur SMS)"],
      transfers: "Aucun transfert hors de l'Union européenne.",
    });
  });

  it("filtres catégorie et « À décider », recherche hors de la première page, around", async () => {
    const { s, api } = await read();
    const contact = await api.data(s.projectId, "?category=contact");
    expect(fields(contact.body)).toEqual(["clientes.telephone"]);
    const undecided = await api.data(s.projectId, "?undecided=true");
    expect(undecided.body.total).toBe(58);
    expect(fields(undecided.body)).not.toContain("clientes.nom");
    const found = await api.data(s.projectId, "?q=volume.c56");
    expect(fields(found.body)).toEqual(["volume.c56"]);
    const byName = await api.data(s.projectId, "?q=gérante");
    expect(fields(byName.body)).toEqual(["clientes.nom"]);
    const around = await api.data(s.projectId, "?around=volume.c56");
    expect(around.body.offset).toBe(50);
    expect((await api.data(s.projectId, "?around=volume.absent")).status).toBe(404);
  });
});

describe("security.registry.export", () => {
  it("Markdown : données personnelles, « À décider », texte échappé, sous-traitants", async () => {
    const { s, api } = await read();
    const res = await api.registry(s.projectId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.filename).toMatch(/^registre-rgpd-[a-z0-9-]+\.md$/);
    expect(res.body.markdown).toContain("Nom \\| &lt;b&gt;prénom&lt;/b&gt;");
    expect(res.body.markdown).not.toContain("<b>");
    expect(res.body.markdown).toContain("| Téléphone | clientes.telephone | Contact | À décider |");
    expect(res.body.markdown).toContain("Prestataire SMS (Fournisseur SMS)");
    expect(res.body.markdown).toContain("à faire relire par un juriste");
  });
});

describe("security.data.classify", () => {
  it("nouvelle entrée puis entrée existante : un lot d'une opération sensitive", async () => {
    const { s, api } = await read();
    const created = await api.classify(s.projectId, {
      data: "Note",
      fields: ["clientes.note"],
      category: "sensitive",
    });
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    expect(created.body.results).toEqual([
      { position: 0, kind: "sensitive.create", specId: "clientes.note" },
    ]);
    const decided = await api.classify(s.projectId, {
      id: "clientes.telephone",
      retention: "3 ans après le dernier rendez-vous",
    });
    expect(decided.status, JSON.stringify(decided.body)).toBe(200);
    const rows = await batchRows(bench().database, s.projectId);
    expect(await operationRows(bench().database, rows[1]?.id ?? "")).toMatchObject([
      {
        kind: "sensitive.update",
        target_spec_id: "clientes.telephone",
        payload: { retention: "3 ans après le dernier rendez-vous" },
      },
    ]);
    const table = await api.classify(s.projectId, {
      data: "Table entière",
      fields: ["volume"],
      category: "technical",
    });
    expect(table.body.results).toEqual([{ position: 0, kind: "sensitive.create", specId: null }]);
    expect((await api.classify(s.projectId, { id: "clientes.note", access: [] })).status).toBe(404);
  });
});
