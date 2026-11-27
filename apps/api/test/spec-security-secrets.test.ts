import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installBench } from "./helpers/repo-scene.ts";
import { batchApi, batchRows } from "./helpers/spec-batch.ts";
import { entryEntity, NEW_THREAT, securityApi, securityScene } from "./helpers/spec-security.ts";

/**
 * TK-117 lot B (cas 1, modèle de menace 6) : aucune valeur de secret n'entre dans la spec par une opération de la
 * Sécurité (valeurs fabriquées à l'exécution), et le résumé refuse tout identifiant technique (modèle de menace 5).
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });

/** Valeur au format d'une clé de fournisseur, assemblée à l'exécution : jamais écrite dans le dépôt. */
const secret = () => ["sk", "live", "x".repeat(32)].join("_");

const OPERATIONS = (value: string) => [
  { kind: "threat.create", ...NEW_THREAT, risk: `Clé ${value}` },
  { kind: "threat.update", specId: "SEC-T01", measures: [value] },
  {
    kind: "sensitive.create",
    data: "Jeton",
    fields: ["t.a"],
    category: "secret",
    protection: value,
  },
  { kind: "sensitive.update", specId: "t.a", retention: value },
  { kind: "right.create", ownershipRule: value },
  { kind: "asvs.create", chapter: "api", title: "Clé", level: 1, answer: value },
  { kind: "asvs.update", facts: [{ label: "Secrets", value }] },
  { kind: "summary.update", incident: value },
  { kind: "doc.section.create", deliverable: "security", title: "Objet", markdown: value },
];

describe("secrets et traces techniques", () => {
  it.each(OPERATIONS(secret()).map((op) => [op.kind, op] as const))(
    "%s avec un secret : 422 sans le recopier, aucun lot",
    async (_, operation) => {
      const s = await securityScene(bench(), [entryEntity("t.a")]);
      const res = await batchApi(bench().app, s.world.actors.owner).submit(s.projectId, {
        idempotencyKey: "secret-1",
        operations: [operation],
      });
      expect(res.status, JSON.stringify(res.body)).toBe(422);
      expect(JSON.stringify(res.body)).not.toContain("x".repeat(32));
      expect(await batchRows(bench().database, s.projectId)).toHaveLength(0);
    },
  );

  it.each(["Voir SEC-T01.", "Fichier security/data.yaml", "Version 7a3d91e", "Rôle RL-accueil"])(
    "résumé avec « %s » : 422, aucun lot",
    async (text) => {
      const s = await securityScene(bench(), [entryEntity("t.a")]);
      const res = await batchApi(bench().app, s.world.actors.owner).submit(s.projectId, {
        idempotencyKey: "trace-1",
        operations: [{ kind: "summary.update", access: text }],
      });
      expect(res.status, JSON.stringify(res.body)).toBe(422);
      expect(res.body.data.field).toBe("operations.0.access");
      expect(await batchRows(bench().database, s.projectId)).toHaveLength(0);
    },
  );

  it("les écritures de la page refusent aussi un secret", async () => {
    const s = await securityScene(bench(), [entryEntity("t.a")]);
    const res = await securityApi(bench().app, s.world.actors.dev).createThreat(s.projectId, {
      risk: secret(),
    });
    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(await batchRows(bench().database, s.projectId)).toHaveLength(0);
  });
});
