import { describe, expect, it } from "vitest";
import * as api from "../src/index.ts";
import { generateOpenApi } from "../src/index.ts";
import { errors, INSTANT, input, isValid, output, UUID, UUID2 } from "./support.ts";

/**
 * TK-93 lot A (contrat 2.8.0, additif) : `project.cards`, `project.creationStatus`,
 * `project.retryRepo`, `project.setEuOnly`, `project.create` étendu, `project.recent` enrichi.
 */
type Doc = {
  info: { version: string };
  paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
};
const doc = async () => (await generateOpenApi()) as unknown as Doc;

const STEPS = [
  { key: "project", status: "done" },
  { key: "idea", status: "done" },
  { key: "invitation", status: "running" },
  { key: "repo", status: "todo" },
];
const CREATION = { status: "running", steps: STEPS, ideaPages: 10, canAct: true };
const ITEM = {
  id: UUID,
  name: "Refonte du portail",
  initials: "RP",
  colorKey: 3,
  clientContact: "Marie Lefèvre",
  phase: "framing",
  progress: { label: "Cadrage", done: 2, total: 7, valueLabel: "2 livrables sur 7" },
  nextAction: { title: "Valider le cahier fonctionnel", attention: true },
  people: [{ initials: "ML", name: "Marie Lefèvre", client: true }],
  lastActivity: { actor: "Camille", at: INSTANT },
  creation: null,
};
const PAGE = {
  items: [ITEM],
  nextCursor: null,
  total: 1,
  facets: { all: 1, idea: 0, framing: 1, iterations: 0 },
  attention: 1,
  audience: "team",
};

describe("PC1 version et surface 2.8.0", () => {
  it("le contrat courant est 3.4.0 (additif : version mineure)", async () => {
    expect(api.CONTRACT_VERSION).toBe("3.4.0");
    expect((await doc()).info.version).toBe("3.4.0");
  });

  it("les 4 nouvelles routes ont leur méthode et leur chemin", async () => {
    const paths = (await doc()).paths;
    expect(paths["/projects/cards"]?.get).toBeDefined();
    expect(paths["/projects/{projectId}/creation"]?.get).toBeDefined();
    expect(paths["/projects/{projectId}/creation/retry"]?.post).toBeDefined();
    expect(paths["/projects/{projectId}/eu-only"]?.patch).toBeDefined();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même route, un test par cas
describe("PC2 project.cards", () => {
  it("entrée : q, phase, tri, curseur, limite de 24 au plus ; tout est facultatif", async () => {
    const cards = input("project.cards");
    expect(await isValid(cards, {})).toBe(true);
    expect(
      await isValid(cards, { q: "por", phase: "idea", sort: "attention", cursor: "c", limit: 24 }),
    ).toBe(true);
    for (const sort of ["activity", "name", "attention"]) {
      expect(await isValid(cards, { sort })).toBe(true);
    }
    expect(await isValid(cards, { limit: 25 })).toBe(false);
    expect(await isValid(cards, { limit: 0 })).toBe(false);
    expect(await isValid(cards, { phase: "baseline" })).toBe(false);
    expect(await isValid(cards, { sort: "date" })).toBe(false);
  });

  it("sortie : cartes, curseur, total, facettes de phase, compteur d'attention, audience", async () => {
    const out = output("project.cards");
    expect(await isValid(out, PAGE)).toBe(true);
    expect(await isValid(out, { ...PAGE, audience: "client" })).toBe(true);
    expect(await isValid(out, { ...PAGE, audience: "autre" })).toBe(false);
    expect(await isValid(out, { ...PAGE, facets: { all: 1 } })).toBe(false);
    const { attention: _a, ...withoutAttention } = PAGE;
    expect(await isValid(out, withoutAttention)).toBe(false);
  });

  it("carte : teinte de 1 à 5, prochaine étape et activité facultatives (null), 3 personnes au plus", async () => {
    const out = output("project.cards");
    const one = (patch: object) => ({ ...PAGE, items: [{ ...ITEM, ...patch }] });
    expect(await isValid(out, one({ colorKey: 0 }))).toBe(false);
    expect(await isValid(out, one({ colorKey: 6 }))).toBe(false);
    expect(
      await isValid(out, one({ nextAction: null, lastActivity: null, clientContact: null })),
    ).toBe(true);
    const person = { initials: "AB", name: "A B", client: false };
    expect(await isValid(out, one({ people: [person, person, person] }))).toBe(true);
    expect(await isValid(out, one({ people: [person, person, person, person] }))).toBe(false);
    expect(await isValid(out, one({ phase: "baseline" }))).toBe(false);
  });

  it("carte de création : statut, 4 étapes, pages d'idée, erreur typée, droit d'agir", async () => {
    const out = output("project.cards");
    const withCreation = (creation: unknown) => ({ ...PAGE, items: [{ ...ITEM, creation }] });
    expect(await isValid(out, withCreation(CREATION))).toBe(true);
    for (const status of ["pending", "running", "succeeded", "failed", "skipped"]) {
      expect(await isValid(out, withCreation({ ...CREATION, status }))).toBe(true);
    }
    expect(await isValid(out, withCreation({ ...CREATION, status: "bof" }))).toBe(false);
    expect(
      await isValid(out, withCreation({ ...CREATION, steps: [{ key: "x", status: "done" }] })),
    ).toBe(false);
    const error = { code: "name_taken", repoName: "koklo-spec", retryAfterMs: 1500 };
    expect(await isValid(out, withCreation({ ...CREATION, status: "failed", error }))).toBe(true);
    expect(await isValid(out, withCreation({ ...CREATION, error: { code: "autre" } }))).toBe(false);
  });

  it("les 12 codes d'erreur de création sont acceptés, aucun autre", async () => {
    const out = output("project.creationStatus");
    const codes = [
      "no_account",
      "name_taken",
      "user_token_required",
      "auth_expired_user",
      "auth_expired_installation",
      "resource_not_accessible",
      "provider_unavailable",
      "rate_limited",
      "account_unavailable",
      "invalid_name",
      "forbidden",
      "unknown",
    ];
    for (const code of codes) {
      expect(await isValid(out, { ...CREATION, status: "failed", error: { code } })).toBe(true);
    }
    expect(await isValid(out, { ...CREATION, status: "failed", error: { code: "network" } })).toBe(
      false,
    );
  });

  it("erreurs : lecture ouverte à tout rôle ayant accès (pas de FORBIDDEN), validation de l'entrée", () => {
    expect(Object.keys(errors("project.cards")).sort()).toEqual([
      "INTERNAL",
      "UNAUTHORIZED",
      "VALIDATION",
    ]);
  });
});

describe("PC3 project.create étendu", () => {
  const create = input("project.create");
  it("reste valide avec le seul nom (compatibilité 2.7.0)", async () => {
    expect(await isValid(create, { name: "Koklo" })).toBe(true);
    expect(await isValid(create, { name: "" })).toBe(false);
    expect(await isValid(create, { name: "x".repeat(101) })).toBe(false);
  });

  it("accepte e-mail client, gabarit, installation, nom de dépôt, UE, clé d'idempotence", async () => {
    expect(
      await isValid(create, {
        name: "Koklo",
        clientEmail: "marie@exemple.fr",
        ideaTemplate: "empty",
        installationId: UUID,
        repoName: "koklo-spec",
        euOnly: true,
        idempotencyKey: "k".repeat(64),
      }),
    ).toBe(true);
  });

  it("refuse e-mail invalide, gabarit inconnu, installation non UUID, clé vide ou trop longue", async () => {
    expect(await isValid(create, { name: "K", clientEmail: "pas-un-mail" })).toBe(false);
    expect(await isValid(create, { name: "K", ideaTemplate: "autre" })).toBe(false);
    expect(await isValid(create, { name: "K", installationId: "x" })).toBe(false);
    expect(await isValid(create, { name: "K", idempotencyKey: "" })).toBe(false);
    expect(await isValid(create, { name: "K", idempotencyKey: "k".repeat(65) })).toBe(false);
    expect(await isValid(create, { name: "K", repoName: "" })).toBe(false);
  });

  it("la sortie reste { id, name } ; VALIDATION s'ajoute aux erreurs", async () => {
    expect(await isValid(output("project.create"), { id: UUID, name: "Koklo" })).toBe(true);
    expect(Object.keys(errors("project.create"))).toContain("VALIDATION");
  });
});

describe("PC4 creationStatus, retryRepo, setEuOnly", () => {
  it("creationStatus : null sans ligne, 404 uniforme sinon", async () => {
    expect(await isValid(input("project.creationStatus"), { projectId: UUID })).toBe(true);
    expect(await isValid(input("project.creationStatus"), { projectId: "x" })).toBe(false);
    expect(await isValid(output("project.creationStatus"), null)).toBe(true);
    expect(await isValid(output("project.creationStatus"), CREATION)).toBe(true);
    expect(Object.keys(errors("project.creationStatus")).sort()).toEqual([
      "INTERNAL",
      "NOT_FOUND",
      "UNAUTHORIZED",
    ]);
  });

  it("retryRepo : nom et installation facultatifs, 409 avec raison, sortie = statut", async () => {
    const retry = input("project.retryRepo");
    expect(await isValid(retry, { projectId: UUID })).toBe(true);
    expect(await isValid(retry, { projectId: UUID, repoName: "n", installationId: UUID2 })).toBe(
      true,
    );
    expect(await isValid(retry, { projectId: UUID, installationId: "x" })).toBe(false);
    expect(await isValid(output("project.retryRepo"), CREATION)).toBe(true);
    const keys = Object.keys(errors("project.retryRepo"));
    expect(keys).toEqual(expect.arrayContaining(["CONFLICT", "FORBIDDEN", "NOT_FOUND"]));
  });

  it("setEuOnly : booléen obligatoire, sortie { euOnly }, droits réservés (FORBIDDEN)", async () => {
    const set = input("project.setEuOnly");
    expect(await isValid(set, { projectId: UUID, euOnly: true })).toBe(true);
    expect(await isValid(set, { projectId: UUID })).toBe(false);
    expect(await isValid(set, { projectId: UUID, euOnly: "oui" })).toBe(false);
    expect(await isValid(output("project.setEuOnly"), { euOnly: false })).toBe(true);
    expect(Object.keys(errors("project.setEuOnly"))).toContain("FORBIDDEN");
  });
});

describe("PC5 project.recent enrichi", () => {
  it("expose initiales et teinte de chaque projet récent", async () => {
    const out = output("project.recent");
    const row = { id: UUID, name: "Koklo", visitedAt: INSTANT, initials: "KO", colorKey: 2 };
    expect(await isValid(out, [row])).toBe(true);
    expect(await isValid(out, [{ ...row, colorKey: 9 }])).toBe(false);
    expect(await isValid(out, [{ id: UUID, name: "Koklo", visitedAt: INSTANT }])).toBe(false);
  });
});
