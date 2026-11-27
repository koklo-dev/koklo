import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installBench } from "./helpers/repo-scene.ts";
import { readScene, seedIndex } from "./helpers/spec-read.ts";
import { operationEntity, stackEntity, technicalApi } from "./helpers/spec-technical.ts";

/**
 * TK-116 lot A (cas 3, B770, B771) : contrat généré d'une opération. Calculé à la lecture depuis l'index et le choix
 * `ST-api` ; aucune écriture ; sans générateur : la raison, jamais de code.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });

const OPERATION = operationEntity("reservation.create", {
  zone: "Prise de rendez-vous",
  entree: { serviceId: { type: "uuid" } },
  sortie: { reservationId: { type: "uuid" } },
  champs: { entree: ["serviceId"], sortie: ["reservationId"] },
  erreurs: [{ code: "CRENEAU_PRIS", quand: "pris", regle: "R-001" }],
});

async function contractWith(stack: Record<string, unknown> | null) {
  const s = await readScene(bench());
  const entities = [OPERATION, ...(stack === null ? [] : [stackEntity("ST-api", stack)])];
  await seedIndex(bench(), s, [], { commit: true, entities });
  const api = technicalApi(bench().app, s.world.actors.dev);
  return { res: await api.contract(s.projectId, "reservation.create"), api, s };
}

describe("spec.technical.contract", () => {
  it("ST-api choisi avec oRPC : chemin, code et générateur", async () => {
    const { res, api, s } = await contractWith({ statut: "choisi", choix: "NestJS · oRPC" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({
      available: true,
      generator: { stackId: "ST-api", label: "TypeScript · oRPC", choice: "NestJS · oRPC" },
      path: "packages/contract/src/prise-de-rendez-vous/reservation.ts",
    });
    expect(res.body.commitSha).toMatch(/^[0-9a-f]{40}$/);
    expect(res.body.code).toContain("export const reservationCreate = oc");
    expect(res.body.code).toContain("    CRENEAU_PRIS: { status: 409 }, // R-001");
    expect((await api.contract(s.projectId, "reservation.absent")).status).toBe(404);
  });

  it.each([
    ["absent", null],
    ["à trancher", { statut: "a_trancher" }],
  ])("ST-api %s : no_choice, sans code", async (_label, stack) => {
    const { res } = await contractWith(stack);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ available: false, reason: "no_choice" });
    expect(res.body).not.toHaveProperty("code");
  });

  it("autre stack : unsupported_stack avec le choix", async () => {
    const { res } = await contractWith({ statut: "choisi", choix: "Express · REST" });
    expect(res.body).toMatchObject({
      available: false,
      reason: "unsupported_stack",
      choice: "Express · REST",
    });
  });
});
