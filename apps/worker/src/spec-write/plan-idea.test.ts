import { checkSpec, emitIdeaIndex, emitIdeaPage } from "@koklo/schema";
import { describe, expect, it } from "vitest";
import { integrityProblem } from "./paths.ts";
import { planBatch } from "./plan.ts";
import type { BatchOperation, LoadedBatch } from "./types.ts";

/**
 * TK-89 lot B (T5) : opérations `idea.*` du plan. Les pages vivent sous `idea/<slug>.md`, l'ordre dans
 * `idea/_index.yaml`, réécrit à chaque publication ; un réordonnancement ne renomme ni ne supprime
 * aucun fichier ; `checkSpec` ne dit rien du dossier `idea/`.
 */
const SLUGS = ["vision", "probleme", "perimetre"] as const;
const TITLES: Record<string, string> = {
  vision: "Vision",
  probleme: "Problème",
  perimetre: "Périmètre",
};

const pagePayload = (slug: string, over: Record<string, unknown> = {}) => ({
  slug,
  title: TITLES[slug] ?? slug,
  status: "draft",
  required: slug !== "perimetre",
  origin: "template",
  mis_a_jour: "2026-11-05T09:30:00.000Z",
  contributeurs: ["Awa"],
  contentMd: `## ${TITLES[slug] ?? slug}\n\nTexte.\n`,
  ...over,
});
const indexPayload = (order: readonly string[]) => ({
  pages: order.map((slug, position) => ({
    slug,
    title: TITLES[slug] ?? slug,
    position,
    required: slug !== "perimetre",
    origin: "template",
    status: "draft",
  })),
  contributorUserIds: [],
  pagesVersions: {},
});
let position = 0;
const op = (kind: string, payload: Record<string, unknown>): BatchOperation => {
  position += 1;
  return { position, kind, targetSpecId: null, payload };
};
const publish = (order: readonly string[], removed: readonly string[] = []) => [
  ...order.map((slug) => op("idea.page.write", pagePayload(slug))),
  ...removed.map((slug) => op("idea.page.delete", { slug })),
  op("idea.index.write", indexPayload(order)),
];
const plan = (
  operations: BatchOperation[],
  files: { path: string; content: string }[] = [],
  authorRole = "dev",
) =>
  planBatch(
    { operations, authorRole },
    [],
    files.map((file) => file.path),
  );
const changes = (result: ReturnType<typeof plan>) => {
  if (!("changes" in result)) throw new Error(`pas de changements : ${JSON.stringify(result)}`);
  return result.changes;
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même publication, un test par comportement
describe("planBatch : publication de l'espace Idée", () => {
  it("écrit idea/<slug>.md par page et réécrit idea/_index.yaml, sans autre fichier", () => {
    const result = changes(plan(publish(SLUGS)));
    expect(result.map((change) => change.path).sort()).toEqual([
      "idea/_index.yaml",
      "idea/perimetre.md",
      "idea/probleme.md",
      "idea/vision.md",
    ]);
    const vision = result.find((change) => change.path === "idea/vision.md");
    expect(vision).toEqual({
      path: "idea/vision.md",
      content: emitIdeaPage({
        slug: "vision",
        title: "Vision",
        status: "draft",
        required: true,
        origin: "template",
        updatedAt: "2026-11-05T09:30:00.000Z",
        contributors: ["Awa"],
        contentMd: "## Vision\n\nTexte.\n",
      }),
    });
  });

  it("l'index suit les positions : requise vraie seulement, ordre de la passation", () => {
    const index = changes(plan(publish(["perimetre", "vision", "probleme"]))).find(
      (change) => change.path === "idea/_index.yaml",
    );
    expect(index).toMatchObject({
      content: emitIdeaIndex({
        structure: "cadrage-par-defaut",
        pages: indexPayload(["perimetre", "vision", "probleme"]).pages.map(
          ({ status: _s, ...page }) => ({
            ...page,
            origin: "template" as const,
          }),
        ),
      }),
    });
    expect((index as { content: string }).content).toContain(
      "- { slug: perimetre, titre: Périmètre }",
    );
  });

  it("supprime les pages retirées qui sont présentes, ignore les absentes", () => {
    const existing = [
      { path: "idea/ancienne.md", content: "x" },
      { path: "idea/autre.md", content: "y" },
    ];
    const result = changes(plan(publish(SLUGS, ["ancienne", "jamais-publiee"]), existing));
    expect(result).toContainEqual({ path: "idea/ancienne.md", delete: true });
    expect(result.some((change) => change.path === "idea/jamais-publiee.md")).toBe(false);
    expect(result.some((change) => change.path === "idea/autre.md")).toBe(false);
  });

  it("un réordonnancement ne renomme ni ne supprime : mêmes fichiers, seul l'index change", () => {
    const first = changes(plan(publish(SLUGS)));
    const published = first.map((change) => ({
      path: change.path,
      content: "content" in change ? change.content : "",
    }));
    const second = changes(plan(publish(["perimetre", "vision", "probleme"]), published));
    expect(second.some((change) => "delete" in change && change.delete)).toBe(false);
    expect(second.map((change) => change.path).sort()).toEqual(
      first.map((change) => change.path).sort(),
    );
    const byPath = (list: typeof first, path: string) =>
      list.find((change) => change.path === path);
    expect(byPath(second, "idea/vision.md")).toEqual(byPath(first, "idea/vision.md"));
    expect(byPath(second, "idea/_index.yaml")).not.toEqual(byPath(first, "idea/_index.yaml"));
  });

  it("n'écrit pas par-dessus une page publiée puis retirée dans le même lot", () => {
    const result = changes(
      plan(
        [...publish(["vision"]), op("idea.page.delete", { slug: "vision" })],
        [{ path: "idea/vision.md", content: "x" }],
      ),
    );
    expect(result.filter((change) => change.path === "idea/vision.md")).toHaveLength(1);
    expect(result.find((change) => change.path === "idea/vision.md")).toHaveProperty("content");
  });

  it("n'applique ni conflit de feature ni contrôle du designer : un designer publie", () => {
    expect(changes(plan(publish(SLUGS), [], "designer"))).toHaveLength(4);
  });

  it("un titre sur plusieurs lignes donne SPEC_INVALID sans changement", () => {
    const bad = [
      op("idea.page.write", pagePayload("vision", { title: "a\nb" })),
      op("idea.index.write", indexPayload(["vision"])),
    ];
    expect(plan(bad)).toMatchObject({ outcome: { status: "failed", errorCode: "SPEC_INVALID" } });
  });

  it("n'exécute pas checkSpec : le dossier idea/ n'ajoute aucun diagnostic", () => {
    const result = changes(plan(publish(SLUGS)));
    const files = result.flatMap((change) =>
      "content" in change ? [{ path: change.path, content: change.content }] : [],
    );
    expect(checkSpec(files).issues).toEqual([]);
  });
});

describe("integrityProblem : opérations idea.*", () => {
  const batch = (operations: BatchOperation[]): LoadedBatch =>
    ({
      branch: "cadrage",
      repo: { specPath: null },
      operations,
    }) as unknown as LoadedBatch;

  it("accepte un lot de publication sans specId", () => {
    expect(integrityProblem(batch(publish(SLUGS, ["ancienne"])))).toBeUndefined();
  });

  it("refuse un slug hors de ^[a-z0-9-]{1,40}$ avant tout appel au fournisseur", () => {
    for (const slug of ["../x", "A", "a/b", "", "a".repeat(41), "a.md", "a b"]) {
      expect(
        integrityProblem(batch([op("idea.page.write", pagePayload("vision", { slug }))])),
      ).toBe("slug");
      expect(integrityProblem(batch([op("idea.page.delete", { slug })]))).toBe("slug");
    }
  });

  it("refuse un payload mal formé et le mélange avec des features", () => {
    expect(integrityProblem(batch([op("idea.page.write", { slug: "vision" })]))).toBe("payload");
    expect(integrityProblem(batch([op("idea.index.write", { pages: "x" })]))).toBe("payload");
    expect(
      integrityProblem(
        batch([op("idea.page.write", { ...pagePayload("vision"), status: "published" })]),
      ),
    ).toBe("payload");
    const mixed = [
      ...publish(SLUGS),
      { position: 9, kind: "feature.create", targetSpecId: "F-001", payload: {} },
    ];
    expect(integrityProblem(batch(mixed))).toBe("kind");
  });
});
