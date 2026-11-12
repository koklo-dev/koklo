import { describe, expect, it, vi } from "vitest";
import {
  currentFeatures,
  type DossierClient,
  frozenPages,
  frozenVersion,
  previousVersion,
  publishedSynthesis,
  RISKS_SLUG,
  readFrozenDossier,
  versionsOf,
} from "../src/dossier-sources.ts";

const PROJECT = "p-1";

interface Fake {
  version?: unknown;
  pages?: { slug: string; title: string; contentMd: string; version: number }[];
  synthesis?: { contentMd: string; source: string | null } | null;
  repo?: { id: string; defaultBranch: string } | null;
  heads?: Record<string, { snapshot: { id: string; status: string } }>;
  features?: { specId: string; title: string; criteria: { title: string }[] }[];
}

/** Client factice : chaque délégué rend la donnée de la scène, les appels sont observables. */
function fakeClient(scene: Fake) {
  const client = {
    ideaVersion: { findFirst: vi.fn(async (_args: unknown) => scene.version ?? null) },
    ideaPage: { findMany: vi.fn(async (_args: unknown) => scene.pages ?? []) },
    ideaSynthesis: { findFirst: vi.fn(async (_args: unknown) => scene.synthesis ?? null) },
    projectRepo: { findFirst: vi.fn(async (_args: unknown) => scene.repo ?? null) },
    specHead: {
      findFirst: vi.fn(
        async ({ where }: { where: { branch: string } }) => scene.heads?.[where.branch] ?? null,
      ),
    },
    specFeature: { findMany: vi.fn(async (_args: unknown) => scene.features ?? []) },
  };
  return { client, typed: client as unknown as DossierClient };
}

describe("versionsOf", () => {
  it("garde les numéros, ignore le reste et les valeurs qui ne sont pas des objets", () => {
    expect(versionsOf({ vision: 2, personas: "1", risques: 1 })).toEqual({ vision: 2, risques: 1 });
    expect(versionsOf(null)).toEqual({});
    expect(versionsOf([1, 2])).toEqual({});
    expect(versionsOf("x")).toEqual({});
  });
});

describe("frozenVersion et previousVersion", () => {
  it("sans baseVersion : la dernière version réglée ; avec baseVersion : ce numéro", async () => {
    const { client, typed } = fakeClient({ version: { number: 2, tag: "idea-v2" } });
    await frozenVersion(typed, PROJECT, null);
    expect(client.ideaVersion.findFirst.mock.calls[0]?.[0]).toMatchObject({
      where: { projectId: PROJECT, commitSha: { not: null } },
      orderBy: { number: "desc" },
    });
    expect(client.ideaVersion.findFirst.mock.calls[0]?.[0]).not.toHaveProperty("where.number");
    await frozenVersion(typed, PROJECT, 1);
    expect(client.ideaVersion.findFirst.mock.calls[1]?.[0]).toMatchObject({ where: { number: 1 } });
  });

  it("previousVersion cherche un numéro strictement inférieur", async () => {
    const { client, typed } = fakeClient({});
    expect(await previousVersion(typed, PROJECT, 3)).toBeNull();
    expect(client.ideaVersion.findFirst.mock.calls[0]?.[0]).toMatchObject({
      where: { number: { lt: 3 } },
    });
  });
});

describe("frozenPages", () => {
  const pages = [
    { slug: "vision", title: "Vision", contentMd: "v", version: 2 },
    { slug: "personas", title: "Personas", contentMd: "p", version: 3 },
    { slug: "cibles", title: "Cibles", contentMd: "c", version: 1 },
  ];

  it("exclut une page modifiée depuis le gel", async () => {
    const { typed } = fakeClient({ pages });
    const read = await frozenPages(typed, PROJECT, { vision: 2, personas: 2, cibles: 1 });
    expect(read.map((page) => page.slug)).toEqual(["vision", "cibles"]);
    expect(read[0]).toEqual({ slug: "vision", title: "Vision", content: "v" });
  });

  it("only restreint aux pages citées", async () => {
    const { typed } = fakeClient({ pages });
    const read = await frozenPages(typed, PROJECT, { vision: 2, cibles: 1 }, new Set(["cibles"]));
    expect(read.map((page) => page.slug)).toEqual(["cibles"]);
  });
});

describe("publishedSynthesis", () => {
  it("rend le texte d'une synthèse publiée, null sinon", async () => {
    expect(
      await publishedSynthesis(
        fakeClient({ synthesis: { contentMd: "S", source: "agent" } }).typed,
        PROJECT,
      ),
    ).toBe("S");
    expect(
      await publishedSynthesis(
        fakeClient({ synthesis: { contentMd: "S", source: null } }).typed,
        PROJECT,
      ),
    ).toBeNull();
    expect(await publishedSynthesis(fakeClient({}).typed, PROJECT)).toBeNull();
  });
});

describe("currentFeatures", () => {
  const features = [{ specId: "F-001", title: "Connexion", criteria: [{ title: "AC-1" }] }];

  it("sans dépôt de spec : aucune fonctionnalité", async () => {
    expect(await currentFeatures(fakeClient({}).typed, PROJECT)).toEqual([]);
  });

  it("lit la branche de cadrage d'abord", async () => {
    const { client, typed } = fakeClient({
      repo: { id: "r", defaultBranch: "main" },
      heads: { cadrage: { snapshot: { id: "s1", status: "ready" } } },
      features,
    });
    expect(await currentFeatures(typed, PROJECT)).toEqual([
      { specId: "F-001", title: "Connexion", criteria: ["AC-1"] },
    ]);
    expect(client.specFeature.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { snapshotId: "s1" },
      take: 300,
    });
  });

  it("sans tête de cadrage : la branche par défaut", async () => {
    const { client, typed } = fakeClient({
      repo: { id: "r", defaultBranch: "main" },
      heads: { main: { snapshot: { id: "s2", status: "ready" } } },
      features,
    });
    expect(await currentFeatures(typed, PROJECT)).toHaveLength(1);
    expect(client.specFeature.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { snapshotId: "s2" },
    });
  });

  it("index en échec : aucune fonctionnalité ; aucune tête : aucune fonctionnalité", async () => {
    const failed = fakeClient({
      repo: { id: "r", defaultBranch: "main" },
      heads: { cadrage: { snapshot: { id: "s1", status: "failed" } } },
      features,
    });
    expect(await currentFeatures(failed.typed, PROJECT)).toEqual([]);
    expect(failed.client.specFeature.findMany).not.toHaveBeenCalled();
    const none = fakeClient({ repo: { id: "r", defaultBranch: "main" }, heads: {} });
    expect(await currentFeatures(none.typed, PROJECT)).toEqual([]);
  });
});

describe("readFrozenDossier", () => {
  it("sans version figée : null, rien d'autre n'est lu", async () => {
    const { client, typed } = fakeClient({});
    expect(await readFrozenDossier(typed, PROJECT)).toBeNull();
    expect(client.ideaPage.findMany).not.toHaveBeenCalled();
  });

  it("sépare la page des risques des pages générales", async () => {
    const { typed } = fakeClient({
      version: { number: 1, tag: "idea-v1", pagesVersions: { vision: 1, [RISKS_SLUG]: 1 } },
      pages: [
        { slug: "vision", title: "Vision", contentMd: "v", version: 1 },
        { slug: RISKS_SLUG, title: "Risques", contentMd: "r", version: 1 },
      ],
      synthesis: { contentMd: "S", source: "agent" },
    });
    expect(await readFrozenDossier(typed, PROJECT)).toEqual({
      tag: "idea-v1",
      pages: [{ slug: "vision", title: "Vision", content: "v" }],
      synthesis: "S",
      risks: "r",
      features: [],
    });
  });

  it("sans page des risques : risks null", async () => {
    const { typed } = fakeClient({
      version: { number: 1, tag: "idea-v1", pagesVersions: { vision: 1 } },
      pages: [{ slug: "vision", title: "Vision", contentMd: "v", version: 1 }],
    });
    expect((await readFrozenDossier(typed, PROJECT))?.risks).toBeNull();
  });
});
