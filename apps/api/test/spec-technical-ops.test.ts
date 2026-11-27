import { emitOperationYaml } from "@koklo/schema";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installBench } from "./helpers/repo-scene.ts";
import { commitAtHead } from "./helpers/spec-architecture.ts";
import { itemApi } from "./helpers/spec-items.ts";
import { readScene, seedIndex } from "./helpers/spec-read.ts";
import {
  componentEntity,
  nfrEntity,
  operationEntity,
  restEntity,
  rolesEntity,
  technicalApi,
} from "./helpers/spec-technical.ts";

/**
 * TK-116 lot A (cas 1, 2, B772, B773, B778) : onglet API. `ops.list` (pages de 50, tri zone puis nom de l'index, facettes
 * par zone, `q`, `around`, REST absent), fiche et appelants, YAML et listes de la feuille.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
const pad = (n: number) => String(n).padStart(2, "0");

const AGENDA = Array.from({ length: 55 }, (_, n) =>
  operationEntity(`agenda.op${pad(n + 1)}`, { zone: "Agenda" }),
);
const CREATE = {
  zone: "Réservation",
  permission: "PM-reservation.creer",
  resume: "Crée une réservation.",
  entree: {
    serviceId: { type: "uuid", contrainte: "Service actif" },
    nom: { type: "texte(100)" },
  },
  sortie: { statut: { type: "enum", note: "confirmee" } },
  champs: { entree: ["serviceId", "nom"], sortie: ["statut"] },
  erreurs: [
    { code: "CRENEAU_PRIS", quand: "créneau pris", regle: "R-001" },
    { code: "SERVICE_INACTIF", quand: "service retiré" },
  ],
  regles: ["R-001"],
  sert: ["F-001"],
  limite: "20 par minute",
};
/** Ordre des graines = rang d'index posé par le worker : zone puis nom. */
const SEEDS = () => [
  restEntity("E-auth-register"),
  restEntity("ancien.lire"),
  ...AGENDA,
  operationEntity("reservation.cancel", {
    zone: "Réservation",
    resume: "Annule la réservation.",
    titre: "Annule la réservation.",
  }),
  operationEntity("reservation.create", { ...CREATE, titre: CREATE.resume }),
  componentEntity("C-api", { zone: "Noyau" }),
  componentEntity("C-worker", { zone: "Communication" }),
  rolesEntity(),
];

async function seeded() {
  const s = await readScene(bench());
  const { snapshotId } = await seedIndex(bench(), s, [], { commit: true, entities: SEEDS() });
  return { ...s, snapshotId, api: technicalApi(bench().app, s.world.actors.dev) };
}
const ids = (body: { items: { specId: string }[] }) => body.items.map((item) => item.specId);
const FACETS = { zone: { Agenda: 55, Réservation: 2 } };

describe("spec.technical.ops.list", () => {
  it("pages de 50 dans l'ordre de l'index, facettes par zone, REST absent", async () => {
    const s = await seeded();
    const first = await s.api.ops(s.projectId);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.total).toBe(57);
    expect(first.body.items).toHaveLength(50);
    expect(first.body.facets).toEqual(FACETS);
    expect(first.body.items[0]).toEqual({
      specId: "agenda.op01",
      type: "write",
      zone: "Agenda",
      component: "C-api",
      summary: "Opération agenda.op01.",
      permission: "public",
      filePath: "endpoint/agenda.op01",
    });
    const next = await s.api.ops(s.projectId, `?cursor=${first.body.nextCursor}`);
    expect(ids(next.body).slice(-2)).toEqual(["reservation.cancel", "reservation.create"]);
    expect(next.body.nextCursor).toBeNull();
    expect(JSON.stringify([first.body, next.body])).not.toMatch(/ancien\.lire|E-auth/);
  });

  it("zone filtre la liste sans réduire les facettes ; q trouve hors de la première page", async () => {
    const s = await seeded();
    const zone = await s.api.ops(s.projectId, `?zone=${encodeURIComponent("Réservation")}`);
    expect(ids(zone.body)).toEqual(["reservation.cancel", "reservation.create"]);
    expect(zone.body.facets).toEqual(FACETS);
    const byName = await s.api.ops(s.projectId, "?q=reservation.");
    expect(ids(byName.body)).toEqual(["reservation.cancel", "reservation.create"]);
    expect(byName.body.facets).toEqual({ zone: { Réservation: 2 } });
    const bySummary = await s.api.ops(s.projectId, "?q=annul");
    expect(ids(bySummary.body)).toEqual(["reservation.cancel"]);
    expect((await s.api.ops(s.projectId, "?q=ancien")).body.total).toBe(0);
  });

  it("around amène une opération ; hors filtre : première page ; inconnue : 404 ; rien d'indexé : vide", async () => {
    const s = await seeded();
    const around = await s.api.ops(s.projectId, "?around=reservation.create");
    expect(around.body.offset).toBe(50);
    expect(ids(around.body)).toContain("reservation.create");
    const outside = await s.api.ops(s.projectId, "?around=reservation.create&zone=Agenda&limit=2");
    expect(ids(outside.body)).toEqual(["agenda.op01", "agenda.op02"]);
    expect((await s.api.ops(s.projectId, "?around=agenda.absent")).status).toBe(404);
    const empty = await readScene(bench());
    const res = await technicalApi(bench().app, empty.world.actors.dev).ops(empty.projectId);
    expect(res.body).toMatchObject({ items: [], total: 0, facets: { zone: {} } });
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("spec.technical.ops.byId, source et options", () => {
  it("fiche complète : champs dans l'ordre du fichier, quatre appelants au plus avec leur restriction", async () => {
    const s = await seeded();
    const res = await s.api.op(s.projectId, "reservation.create");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({
      specId: "reservation.create",
      zone: "Réservation",
      component: "C-api",
      summary: "Crée une réservation.",
      permission: "PM-reservation.creer",
      input: [
        { field: "serviceId", type: "uuid", constraint: "Service actif" },
        { field: "nom", type: "texte(100)" },
      ],
      output: [{ field: "statut", type: "enum", note: "confirmee" }],
      errors: [
        { code: "CRENEAU_PRIS", when: "créneau pris", rule: "R-001" },
        { code: "SERVICE_INACTIF", when: "service retiré" },
      ],
      rules: ["R-001"],
      features: ["F-001"],
      rateLimit: "20 par minute",
      filePath: "endpoint/reservation.create",
    });
    expect(res.body.callers).toEqual([
      { name: "Client", restriction: "les siennes" },
      { name: "Accueil" },
      { name: "Gérant" },
      { name: "Employé" },
    ]);
    expect(res.body.commitSha).toMatch(/^[0-9a-f]{40}$/);
    const open = await s.api.op(s.projectId, "agenda.op01");
    expect(open.body).toMatchObject({ permission: "public", callers: [], input: [] });
  });

  it("opération inconnue ou endpoint REST : 404", async () => {
    const s = await seeded();
    for (const id of ["agenda.absent", "ancien.lire"]) {
      expect((await s.api.op(s.projectId, id)).status, id).toBe(404);
      expect((await s.api.opSource(s.projectId, id)).status, id).toBe(404);
    }
  });

  it("source : YAML généré depuis l'index, puis le fichier du commit quand il existe", async () => {
    const s = await seeded();
    const generated = await s.api.opSource(s.projectId, "reservation.create");
    expect(generated.status, JSON.stringify(generated.body)).toBe(200);
    expect(generated.body.generated).toBe(true);
    expect(generated.body.text).toContain("id: reservation.create");
    expect(generated.body.text).not.toMatch(/titre:|champs:/);
    expect(generated.body.text.indexOf("serviceId")).toBeLessThan(
      generated.body.text.indexOf("nom:"),
    );
    const content = emitOperationYaml({
      id: "reservation.create",
      type: "ecriture",
      zone: "Réservation",
      composant: "C-api",
      permission: "public",
      resume: "Depuis Git.",
    });
    await commitAtHead(bench(), s, s.snapshotId, [
      { path: "endpoint/reservation.create", content },
    ]);
    const stored = await s.api.opSource(s.projectId, "reservation.create");
    expect(stored.body).toMatchObject({ generated: false, text: content });
  });

  it("options : zones des composants et des opérations, permissions des rôles, triées ; vide sans index", async () => {
    const s = await seeded();
    const res = await s.api.options(s.projectId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({
      zones: ["Agenda", "Communication", "Noyau", "Réservation"],
      permissions: ["PM-agenda.lire", "PM-caisse.cloturer", "PM-reservation.creer"],
    });
    const empty = await readScene(bench());
    const api = technicalApi(bench().app, empty.world.actors.dev);
    expect((await api.options(empty.projectId)).body).toEqual({ zones: [], permissions: [] });
    expect((await api.op(empty.projectId, "a.b")).status).toBe(404);
  });
});

describe("spec.item.get operation et nfr", () => {
  it("fiche de la feuille, éléments qui citent l'opération (jeton exact), non validé ; inconnu : 404", async () => {
    const s = await readScene(bench());
    await seedIndex(bench(), s, [], {
      commit: true,
      entities: [
        operationEntity("agenda.day"),
        nfrEntity("NFR-001", {
          enonce: "agenda.day répond vite.",
          verification: { mode: "manuel" },
        }),
        nfrEntity("NFR-002", { enonce: "agenda.dayplus et agendaXday ne comptent pas." }),
      ],
    });
    const items = itemApi(bench().app, s.world.actors.designer);
    const operation = await items.get(s.projectId, "agenda.day", "operation");
    expect(operation.status, JSON.stringify(operation.body)).toBe(200);
    expect(operation.body).toMatchObject({
      type: "operation",
      validated: false,
      values: { specId: "agenda.day", component: "C-api" },
    });
    expect(operation.body.referencedBy).toMatchObject({ total: 1, items: [{ specId: "NFR-001" }] });
    const nfr = await items.get(s.projectId, "NFR-001", "nfr");
    expect(nfr.body.values).toMatchObject({ specId: "NFR-001", verification: "manual" });
    expect((await items.get(s.projectId, "NFR-999", "nfr")).status).toBe(404);
    expect((await items.get(s.projectId, "agenda.absent", "operation")).status).toBe(404);
  });
});
