import { GitProviderUnavailableError } from "@koklo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  clientSpaceApi,
  createSpaceScene,
  type SpaceScene,
  seedReview,
} from "./helpers/client-space.ts";
import { installBench } from "./helpers/repo-scene.ts";
import { type FeatureSeed, seedIndex } from "./helpers/spec-read.ts";

/**
 * TK-55b : fuite de vocabulaire technique, côté exécution. Le client ne voit jamais le vocabulaire
 * interne (ticket, branche, SHA brut, chemin de fichier, dépôt, fournisseur) : ni dans les réponses
 * nominales, ni dans les échecs d'indexation, ni dans les erreurs du fournisseur. Seule exception
 * documentée : le jeton opaque `version`.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: SpaceScene;
beforeEach(async () => {
  scene = await createSpaceScene(bench());
});

const FEATURE: FeatureSeed = {
  id: "F-001",
  titre: "Connexion",
  description: "Se connecter.",
  criteres: [{ titre: "Valide", etapes: [{ type: "alors", texte: "connecté" }] }],
  tables: ["T-user"],
  endpoints: ["E-login"],
};
const FORBIDDEN_KEYS = new Set([
  "git",
  "github",
  "commit",
  "sha",
  "branch",
  "merge",
  "pull",
  "repo",
  "tag",
  "diff",
  "path",
  "snapshot",
  "tables",
  "endpoints",
  "errorcode",
  "filepath",
  "commitsha",
  "ticket",
]);

const keysOf = (node: unknown): string[] =>
  Array.isArray(node)
    ? node.flatMap(keysOf)
    : node && typeof node === "object"
      ? Object.entries(node).flatMap(([key, value]) => [key, ...keysOf(value)])
      : [];
const wordsOf = (key: string) => [
  key.toLowerCase(),
  ...key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/),
];

/** Sérialise sans le jeton `version`, seule valeur autorisée à ressembler à un SHA. */
const withoutVersion = (body: unknown) =>
  JSON.stringify(body, (key, value) => (key === "version" ? "<version>" : value));

function expectNoLeak(label: string, res: { body: unknown }, extraSecrets: string[] = []) {
  const text = withoutVersion(res.body);
  expect(
    keysOf(res.body).filter((key) => wordsOf(key).some((w) => FORBIDDEN_KEYS.has(w))),
    label,
  ).toEqual([]);
  expect(text, label).not.toMatch(/\b[0-9a-f]{40}\b/);
  expect(text, label).not.toMatch(
    /cadrage|"main"|github|SPEC_INDEX_FAILED|PROVIDER_|features\/F-|\.md\b/i,
  );
  for (const secret of extraSecrets) expect(text, `${label} : ${secret}`).not.toContain(secret);
}

describe("clientSpace : réponses nominales", () => {
  it("projets, liste et détail ne contiennent aucun vocabulaire technique", async () => {
    const { sha } = await seedIndex(bench(), scene.p1, [FEATURE], {
      commit: true,
      tables: ["T-user"],
      endpoints: [{ id: "E-login", method: "POST", path: "/login" }],
    });
    await seedReview(bench().database, scene.p1, { targetRef: "F-001", status: "approved", sha });
    const space = clientSpaceApi(bench().app, scene.c1);
    const secrets = [
      scene.p1.ref.name,
      scene.p1.installation.ownerLogin,
      "T-user",
      "E-login",
      "/login",
    ];

    const responses = [
      await space.projects(),
      await space.features(scene.p1.projectId),
      await space.feature(scene.p1.projectId, "F-001"),
    ];

    for (const [index, res] of responses.entries()) {
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expectNoLeak(`nominal ${index}`, res, secrets);
    }
  });

  it("le jeton version est la seule valeur de forme SHA des réponses de liste et de détail", async () => {
    const { sha } = await seedIndex(bench(), scene.p1, [FEATURE], { commit: true });
    const space = clientSpaceApi(bench().app, scene.c1);

    const list = await space.features(scene.p1.projectId);
    const one = await space.feature(scene.p1.projectId, "F-001");

    for (const res of [list, one]) {
      expect(res.body.version).toBe(sha);
      expect(JSON.stringify(res.body).match(/[0-9a-f]{40}/g)).toEqual([sha]);
    }
  });
});

describe("clientSpace : échecs", () => {
  it("index en échec, aucune spec, fournisseur en panne : aucune fuite", async () => {
    const space = clientSpaceApi(bench().app, scene.c1);
    const secrets = [scene.p1.ref.name, scene.p1.installation.ownerLogin, "spec_too_large"];
    const none = await space.features(scene.p1.projectId);

    await seedIndex(bench(), scene.p1, [FEATURE], {
      commit: true,
      status: "failed",
      errorCode: "spec_too_large",
    });
    const failed = [
      await space.features(scene.p1.projectId),
      await space.feature(scene.p1.projectId, "F-001"),
    ];

    await seedIndex(bench(), scene.p1, [FEATURE], { commit: true });
    bench().harness.failWith(
      "readFile",
      new GitProviderUnavailableError({ operation: "readFile" }),
    );
    const provider = await space.feature(scene.p1.projectId, "F-001");

    for (const [label, res] of [
      ["aucune spec", none],
      ["échec", failed[0]],
      ["échec détail", failed[1]],
      ["fournisseur", provider],
    ] as const) {
      expectNoLeak(label, res as { body: unknown }, secrets);
    }
  });

  it("404 : le corps d'un projet inaccessible ne cite ni l'identifiant demandé ni le projet réel", async () => {
    await seedIndex(bench(), scene.p2, [FEATURE], { commit: true });
    const res = await clientSpaceApi(bench().app, scene.c1).features(scene.p2.projectId);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(JSON.stringify(res.body)).not.toContain(scene.p2.projectId);
    expectNoLeak("404", res);
  });
});
