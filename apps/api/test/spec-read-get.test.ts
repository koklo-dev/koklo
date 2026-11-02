import {
  GitAuthExpiredError,
  GitNotFoundError,
  GitProviderUnavailableError,
  GitRateLimitedError,
} from "@koklo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installBench } from "./helpers/repo-scene.ts";
import {
  type FeatureSeed,
  featureMarkdown,
  featurePath,
  readScene,
  type SpecReadScene,
  seedIndex,
  setSpecPath,
  specReadApi,
} from "./helpers/spec-read.ts";

/** TK-45c2 : spec.getFeature (ligne d'index puis lecture de git au commit indexé). */
const bench = installBench({ beforeAll, afterAll, beforeEach });

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
        { type: "et", texte: "je vois l'accueil" },
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

const getOf = (s: SpecReadScene, specId = "F-001", role: "dev" | "client" | "business" = "dev") =>
  specReadApi(bench().app, s.world.actors[role]).get(s.projectId, specId);

async function indexedLogin() {
  const s = await readScene(bench());
  const { sha } = await seedIndex(bench(), s, [LOGIN], {
    commit: true,
    tables: ["T-user"],
    endpoints: [{ id: "E-login", method: "POST", path: "/login" }],
  });
  return { s, sha };
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("spec.getFeature : détail lu dans git au commit indexé", () => {
  it("rend description, critères avec étapes typées et liens, plus filePath et commitSha de l'index", async () => {
    const { s, sha } = await indexedLogin();

    const res = await getOf(s);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({
      specId: "F-001",
      title: "Connexion",
      status: "specifiee",
      priority: "must",
      description: "Se connecter avec son e-mail.",
      criteria: [
        {
          specId: "AC-1",
          position: 1,
          title: "Mot de passe valide",
          steps: [
            { type: "etant_donne", text: "un compte actif" },
            { type: "quand", text: "je saisis mon mot de passe" },
            { type: "alors", text: "je suis connecté" },
            { type: "et", text: "je vois l'accueil" },
          ],
        },
        {
          specId: "AC-2",
          position: 2,
          title: "Mot de passe invalide",
          steps: [{ type: "alors", text: "une erreur s'affiche" }],
        },
      ],
      tables: ["T-user"],
      endpoints: ["E-login"],
      screens: ["S-accueil"],
      roles: ["RL-admin"],
      rules: ["R-001"],
      nfr: ["NFR-perf"],
      filePath: "features/F-001-connexion.md",
      commitSha: sha,
    });
  });

  it("lit au SHA indexé, pas à la tête actuelle de la branche (le commit suivant n'est pas encore indexé)", async () => {
    const { s, sha } = await indexedLogin();
    const b = bench();
    const auth = await b.harness.authFor(s.owner);
    await b.harness.inner.writeCommit({
      auth,
      repo: s.ref,
      branch: "cadrage",
      author: { name: "Koklo", email: "koklo-bot@users.noreply.invalid" },
      message: "test: commit non indexé",
      files: [
        {
          path: featurePath(LOGIN),
          content: await featureMarkdown({ ...LOGIN, description: "NOUVELLE description" }),
        },
      ],
    });
    b.harness.calls = [];

    const res = await getOf(s);

    expect(res.body.description).toBe("Se connecter avec son e-mail.");
    expect(res.body.commitSha).toBe(sha);
    const reads = b.harness.callsOf("readFile");
    expect(reads).toHaveLength(1);
    expect(reads[0]?.request).toMatchObject({ ref: sha, path: featurePath(LOGIN) });
  });

  it("monorepo : le chemin lu est préfixé par spec_path, filePath reste relatif à la racine de la spec", async () => {
    const s = await readScene(bench());
    await setSpecPath(bench().database, s, "docs/spec");
    await seedIndex(bench(), s, [LOGIN], { commit: true, specPath: "docs/spec" });
    bench().harness.calls = [];

    const res = await getOf(s);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.filePath).toBe("features/F-001-connexion.md");
    expect(bench().harness.callsOf("readFile")[0]?.request).toMatchObject({
      path: "docs/spec/features/F-001-connexion.md",
    });
  });

  it("une feature absente du dernier instantané indexé est introuvable (anciens commits ignorés)", async () => {
    const s = await readScene(bench());
    await seedIndex(bench(), s, [LOGIN], { commit: true, noHead: true });
    await seedIndex(bench(), s, [{ id: "F-002", titre: "Autre" }], { commit: true });

    const res = await getOf(s);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });

  it("le business (rôle en lecture) obtient le même détail", async () => {
    const { s } = await indexedLogin();

    const res = await getOf(s, "F-001", "business");

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Connexion");
  });

  it("le client est refusé (TK-55a, D7) : 403, sans titre ni chemin de fichier", async () => {
    const { s } = await indexedLogin();

    const res = await getOf(s, "F-001", "client");

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
    expect(JSON.stringify(res.body)).not.toMatch(/Connexion|filePath|commitSha/);
  });
});

describe("spec.getFeature : appels au fournisseur", () => {
  it("authentifie puis lit une seule fois, hors de toute transaction SQL, sans jeton dans la réponse", async () => {
    const { s } = await indexedLogin();
    const b = bench();
    b.harness.calls = [];

    const res = await getOf(s);

    expect(b.harness.names()).toEqual(["authenticate", "readFile"]);
    expect(b.harness.calls.map((call) => call.openTransactions)).toEqual([0, 0]);
    expect(JSON.stringify(res.body)).not.toMatch(/token|ghs_|ghu_/i);
  });

  it("instantané failed : 409 SPEC_INDEX_FAILED avant tout appel au fournisseur", async () => {
    const s = await readScene(bench());
    const { sha } = await seedIndex(bench(), s, [], {
      status: "failed",
      errorCode: "spec_too_large",
    });
    bench().harness.calls = [];

    const res = await getOf(s, "F-001");

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SPEC_INDEX_FAILED");
    expect(res.body.data).toEqual({ errorCode: "spec_too_large", commitSha: sha });
    expect(bench().harness.calls).toEqual([]);
  });

  it.each(["suspended", "deleted"])(
    "installation %s : 503 PROVIDER_UNAVAILABLE sans appel au fournisseur",
    async (status) => {
      const { s } = await indexedLogin();
      const b = bench();
      await b.database.query(
        "UPDATE provider_installations SET status = $2::installation_status WHERE id = $1",
        [s.installation.id, status],
      );
      b.harness.calls = [];

      const res = await getOf(s);

      expect(res.status).toBe(503);
      expect(res.body.code).toBe("PROVIDER_UNAVAILABLE");
      expect(b.harness.calls).toEqual([]);
    },
  );
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("spec.getFeature : erreurs du fournisseur", () => {
  const operation = "readFile";
  it.each([
    [
      "readFile",
      () => new GitRateLimitedError({ operation, retryAfterMs: 1500 }),
      429,
      "PROVIDER_RATE_LIMITED",
    ],
    ["readFile", () => new GitProviderUnavailableError({ operation }), 503, "PROVIDER_UNAVAILABLE"],
    [
      "authenticate",
      () =>
        new GitAuthExpiredError({
          operation: "authenticate",
          kind: "installation",
          refreshable: false,
        }),
      403,
      "PROVIDER_AUTH_EXPIRED",
    ],
    [
      "readFile",
      () => new GitNotFoundError({ operation, resource: "file", identifier: "features/F-001" }),
      404,
      "NOT_FOUND",
    ],
  ])("%s en échec -> %s %s", async (method, makeError, status, code) => {
    const { s } = await indexedLogin();
    bench().harness.failWith(method, makeError());

    const res = await getOf(s);

    expect(res.status).toBe(status);
    expect(res.body.code).toBe(code);
    expect(JSON.stringify(res.body)).not.toContain("features/F-001");
  });

  it("sans App GitHub configurée (fournisseur absent) : 503 PROVIDER_UNAVAILABLE, l'index reste lisible", async () => {
    const { s } = await indexedLogin();
    const { createRepoApp } = await import("./helpers/repos.ts");
    const app = await createRepoApp(bench().database.url, { provider: null });
    try {
      const api = specReadApi(app, s.world.actors.dev);

      const detail = await api.get(s.projectId, "F-001");
      const list = await api.list(s.projectId);
      const head = await api.head(s.projectId);

      expect(detail.status).toBe(503);
      expect(detail.body.code).toBe("PROVIDER_UNAVAILABLE");
      expect(list.status).toBe(200);
      expect(list.body.items).toHaveLength(1);
      expect(head.status).toBe(200);
    } finally {
      await app.close();
    }
  });
});
