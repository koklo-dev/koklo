import * as contract from "@koklo/contract";
import { describe, expect, it } from "vitest";
import { buildIdeaBatch, IDEA_OPERATION_KINDS } from "../src/idea/idea-batch.ts";
import { read } from "./helpers/parity.ts";

/**
 * TK-89 lot B : parité entre le lot que produit `idea.publish` (api), le contrat (`specBatch.get`) et
 * le worker, qui ne peut importer ni l'api ni le contrat. Le worker est relu par chemin.
 */
const workerPaths = read("apps/worker/src/spec-write/paths.ts");
const workerPayload = read("apps/worker/src/spec-write/idea-payload.ts");

/** Un lot de passage au cadrage complet : pages, retrait, index, Synthèse et tag. */
function freezeBatch() {
  const now = new Date("2026-11-08T10:00:00.000Z");
  return buildIdeaBatch(
    {
      pages: [
        {
          id: "p",
          slug: "vision",
          title: "Vision",
          position: 0,
          required: true,
          origin: "template",
          status: "draft",
          version: 1,
          updatedAt: now,
          contentMd: "x",
          contributorNames: ["Awa"],
        } as never,
      ],
      removedSlugs: ["ancienne"],
      contributorUserIds: ["u"],
      synthesis: null,
    },
    "k",
    "cadrage",
    { synthesis: { contentMd: "Synthèse", source: "idea-v1", generatedAt: now }, tag: "idea-v1" },
  );
}

describe("lot idea.* : api, contrat, worker", () => {
  it("mêmes types d'opérations dans l'api, le contrat et OPERATION_KINDS du worker", () => {
    const contractKinds = (
      contract as unknown as { specOperationKindSchema: { options: string[] } }
    ).specOperationKindSchema.options.filter((kind) => kind.startsWith("idea."));
    const workerKinds = [...workerPaths.matchAll(/"(idea\.[a-z.]+)"/g)].map((m) => m[1]);
    expect([...IDEA_OPERATION_KINDS].sort()).toEqual([...contractKinds].sort());
    expect([...new Set(workerKinds)].sort()).toEqual([...IDEA_OPERATION_KINDS].sort());
  });

  it("chaque clé du payload émis par l'api est lue par le worker", () => {
    const batch = freezeBatch();
    const keys = (kind: string) =>
      Object.keys(batch.operations.find((o) => o.kind === kind)?.payload ?? {}).sort();
    // `pagesVersions` n'est lu que par l'api (trace `IdeaPublication`) : le worker l'ignore.
    for (const key of [
      ...keys("idea.page.write"),
      ...keys("idea.page.delete"),
      ...keys("idea.index.write"),
      ...keys("idea.synthesis.write"),
      ...keys("idea.version.tag"),
    ].filter((key) => key !== "pagesVersions")) {
      expect(workerPayload, `clé ${key} non lue par le worker`).toMatch(new RegExp(`\\b${key}\\b`));
    }
    const indexPage = Object.keys(
      (batch.operations.find((o) => o.kind === "idea.index.write")?.payload as { pages: object[] })
        ?.pages[0] ?? {},
    );
    for (const key of indexPage) expect(workerPayload).toMatch(new RegExp(`\\b${key}\\b`));
  });

  it("le slug accepté par le worker couvre tout slug du domaine (40 caractères)", () => {
    expect(workerPaths).toContain("{1,40}");
  });

  it("aucune clé de payload ne porte d'e-mail", () => {
    const batch = buildIdeaBatch(
      { pages: [], removedSlugs: [], contributorUserIds: ["u"], synthesis: null },
      "k",
    );
    expect(JSON.stringify(batch.operations)).not.toMatch(/email|@/i);
  });
});
