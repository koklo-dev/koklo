import {
  GitAuthExpiredError,
  GitNotFoundError,
  GitProviderUnavailableError,
  GitRateLimitedError,
} from "@koklo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  clientSpaceApi,
  createSpaceScene,
  type SpaceScene,
  seedReview,
} from "./helpers/client-space.ts";
import { installBench } from "./helpers/repo-scene.ts";
import { type FeatureSeed, featurePath, SPEC_BRANCH, seedIndex } from "./helpers/spec-read.ts";

/**
 * TK-55b : `clientSpace.feature` (détail) et `SPACE_NOT_READY`. Le détail est lu dans git au SHA
 * indexé ; aucun échec d'index ou de fournisseur ne remonte tel quel : une seule erreur typée 503.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: SpaceScene;
beforeEach(async () => {
  scene = await createSpaceScene(bench());
});

const LOGIN: FeatureSeed = {
  id: "F-001",
  titre: "Connexion",
  statut: "specifiee",
  priorite: "must",
  description: "Se connecter avec son e-mail.",
  criteres: [
    {
      titre: "Mot de passe valide",
      etapes: [
        { type: "etant_donne", texte: "un compte actif" },
        { type: "quand", texte: "je saisis mon mot de passe" },
        { type: "alors", texte: "je suis connecté" },
      ],
    },
    { titre: "Mot de passe invalide", etapes: [{ type: "alors", texte: "une erreur s'affiche" }] },
  ],
  tables: ["T-user"],
  endpoints: ["E-login"],
  ecrans: ["S-accueil"],
  roles: ["RL-admin"],
  regles: ["R-001"],
  nfr: ["NFR-perf"],
};
const api = () => clientSpaceApi(bench().app, scene.c1);
const indexedLogin = () =>
  seedIndex(bench(), scene.p1, [LOGIN], {
    commit: true,
    tables: ["T-user"],
    endpoints: [{ id: "E-login", method: "POST", path: "/login" }],
  });

describe("clientSpace.feature : détail métier", () => {
  it("description, critères et étapes, statut de validation et version ; rien de technique", async () => {
    const { sha } = await indexedLogin();
    await seedReview(bench().database, scene.p1, { targetRef: "F-001", status: "approved", sha });

    const res = await api().feature(scene.p1.projectId, "F-001");

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({
      id: "F-001",
      title: "Connexion",
      description: "Se connecter avec son e-mail.",
      priority: "must",
      criteria: [
        {
          id: "AC-1",
          title: "Mot de passe valide",
          steps: [
            { type: "etant_donne", text: "un compte actif" },
            { type: "quand", text: "je saisis mon mot de passe" },
            { type: "alors", text: "je suis connecté" },
          ],
        },
        {
          id: "AC-2",
          title: "Mot de passe invalide",
          steps: [{ type: "alors", text: "une erreur s'affiche" }],
        },
      ],
      validation: "validated",
      previouslyValidated: false,
      version: sha,
    });
  });

  it("version identique à celle de la liste ; validation identique à celle de la liste", async () => {
    const { sha } = await indexedLogin();
    await seedReview(bench().database, scene.p1, {
      targetRef: "F-001",
      status: "changes_requested",
      sha,
    });

    const list = await api().features(scene.p1.projectId);
    const one = await api().feature(scene.p1.projectId, "F-001");

    expect(one.body.version).toBe(list.body.version);
    expect(one.body.validation).toBe(list.body.items[0].validation);
    expect(one.body.validation).toBe("to_revise");
  });

  it("feature inconnue de la tête : 404 NOT_FOUND ; identifiant mal formé : 422 VALIDATION", async () => {
    await indexedLogin();

    const unknown = await api().feature(scene.p1.projectId, "F-999");
    const malformed = await api().feature(scene.p1.projectId, "F-1");

    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe("NOT_FOUND");
    expect(malformed.status).toBe(422);
    expect(malformed.body.code).toBe("VALIDATION");
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("clientSpace : SPACE_NOT_READY masque tout échec d'index ou de fournisseur", () => {
  // Le statut HTTP est vérifié à part : le corps d'une erreur typée ne porte pas `status`.
  const NOT_READY = { code: "SPACE_NOT_READY" };

  it("aucune spec indexée : 503 SPACE_NOT_READY sur la liste et le détail", async () => {
    const list = await api().features(scene.p1.projectId);
    const one = await api().feature(scene.p1.projectId, "F-001");

    for (const res of [list, one]) {
      expect(res.status, JSON.stringify(res.body)).toBe(503);
      expect(res.body).toMatchObject(NOT_READY);
      expect(res.body.data).toBeUndefined();
    }
  });

  it("index en échec (spec_too_large) : 503 SPACE_NOT_READY, ni SPEC_INDEX_FAILED ni code d'erreur", async () => {
    await seedIndex(bench(), scene.p1, [LOGIN], {
      commit: true,
      status: "failed",
      errorCode: "spec_too_large",
    });

    const list = await api().features(scene.p1.projectId);
    const one = await api().feature(scene.p1.projectId, "F-001");

    for (const res of [list, one]) {
      expect(res.status).toBe(503);
      expect(res.body).toMatchObject(NOT_READY);
      expect(JSON.stringify(res.body)).not.toMatch(
        /spec_too_large|SPEC_INDEX_FAILED|errorCode|[0-9a-f]{40}/,
      );
    }
  });

  it.each([
    ["readFile", () => new GitRateLimitedError({ operation: "readFile", retryAfterMs: 1500 })],
    ["readFile", () => new GitProviderUnavailableError({ operation: "readFile" })],
    [
      "authenticate",
      () =>
        new GitAuthExpiredError({
          operation: "authenticate",
          kind: "installation",
          refreshable: false,
        }),
    ],
    [
      "readFile",
      () =>
        new GitNotFoundError({
          operation: "readFile",
          resource: "file",
          identifier: "features/F-001",
        }),
    ],
  ])(
    "%s en échec côté fournisseur : 503 SPACE_NOT_READY, aucun code PROVIDER_*",
    async (method, makeError) => {
      await indexedLogin();
      bench().harness.failWith(method, makeError());

      const res = await api().feature(scene.p1.projectId, "F-001");

      expect(res.status).toBe(503);
      expect(res.body).toMatchObject(NOT_READY);
      expect(JSON.stringify(res.body)).not.toMatch(/PROVIDER_|features\/F-001|retry/i);
    },
  );

  it.each([["authenticate"], ["readFile"]])(
    "%s lève une erreur brute (non typée) : 503 SPACE_NOT_READY, sans data ni message d'origine",
    async (method) => {
      await indexedLogin();
      bench().harness.failWith(method, new Error("socket hang up token=ghs_SECRET"));

      const res = await api().feature(scene.p1.projectId, "F-001");

      expect(res.status, JSON.stringify(res.body)).toBe(503);
      expect(res.body).toMatchObject(NOT_READY);
      expect(res.body.data).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toMatch(/socket|ghs_SECRET|hang/i);
    },
  );

  it("fichier indexé non parsable : 503 SPACE_NOT_READY, sans data ni message interne", async () => {
    await indexedLogin();
    const auth = await bench().harness.authFor(scene.p1.owner);
    const commit = await bench().harness.inner.writeCommit({
      auth,
      repo: scene.p1.ref,
      branch: SPEC_BRANCH,
      author: { name: "Koklo", email: "koklo-bot@users.noreply.invalid" },
      message: "test: fichier illisible",
      files: [{ path: featurePath(LOGIN), content: "pas du markdown de feature" }],
    });
    await bench().database.query("UPDATE spec_snapshots SET commit_sha = $1", [commit.sha]);

    const res = await api().feature(scene.p1.projectId, "F-001");

    expect(res.status, JSON.stringify(res.body)).toBe(503);
    expect(res.body).toMatchObject(NOT_READY);
    expect(res.body.data).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/parseable|indexed feature/i);
  });

  it("fournisseur non configuré : 503 SPACE_NOT_READY ; la liste (index seul) reste lisible", async () => {
    await indexedLogin();
    const { createRepoApp } = await import("./helpers/repos.ts");
    const app = await createRepoApp(bench().database.url, { provider: null });
    try {
      const space = clientSpaceApi(app, scene.c1);

      const detail = await space.feature(scene.p1.projectId, "F-001");
      const list = await space.features(scene.p1.projectId);

      expect(detail.status).toBe(503);
      expect(detail.body.code).toBe("SPACE_NOT_READY");
      expect(list.status).toBe(200);
    } finally {
      await app.close();
    }
  });
});
