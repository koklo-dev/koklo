import { GitNotFoundError, type GitProvider, GitProviderUnavailableError } from "@koklo/domain";
import { describe, expect, it } from "vitest";
import { type SpecGitTarget, specHeadPaths } from "./spec-head-paths.ts";

/**
 * TK-114e (B671, B676) : chemins de la spec sur la branche du lot, lus frais dans git (pas l'index d'entités), relatifs au
 * dossier de la spec. Branche absente : `null` (pas de pré-vérification) ; fournisseur absent ou en panne : erreur typée.
 */
const TARGET: SpecGitTarget = {
  specPath: "spec",
  repoName: "demo-spec",
  owner: { kind: "organization", login: "acme" },
  installation: { id: "i-1", externalId: "42", active: true },
};
const access = { installationAuth: async () => ({ token: "t" }) as never };

function fakeProvider(listFiles: GitProvider["listFiles"]) {
  const refs: string[] = [];
  const provider = {
    listFiles: (request: Parameters<GitProvider["listFiles"]>[0]) => {
      refs.push(request.ref);
      return listFiles(request);
    },
  } as unknown as GitProvider;
  return { provider, refs };
}
const listing = (paths: string[]) => async () => ({
  ref: "0".repeat(40),
  files: paths.map((path) => ({ path, sha: "1".repeat(40), size: 1 })),
});
const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
};

describe("specHeadPaths", () => {
  it("liste la branche du lot ; chemins relatifs au dossier de la spec, le reste du dépôt ignoré", async () => {
    const { provider, refs } = fakeProvider(
      listing(["README.md", "spec/architecture/components/api.yaml", "spec/features/F-100-a.md"]),
    );
    const paths = await specHeadPaths(provider, access, TARGET, "cadrage");
    expect(paths).toEqual(["architecture/components/api.yaml", "features/F-100-a.md"]);
    expect(refs).toEqual(["cadrage"]);
  });

  it("spec à la racine : tous les chemins", async () => {
    const { provider } = fakeProvider(listing(["features/F-100-a.md"]));
    const paths = await specHeadPaths(provider, access, { ...TARGET, specPath: null }, "cadrage");
    expect(paths).toEqual(["features/F-100-a.md"]);
  });

  it("branche absente : null, aucune pré-vérification", async () => {
    const { provider } = fakeProvider(async () => {
      throw new GitNotFoundError({ operation: "listFiles", resource: "ref", identifier: "x" });
    });
    expect(await specHeadPaths(provider, access, TARGET, "cadrage")).toBeNull();
  });

  it("fournisseur absent, installation inactive ou en panne : PROVIDER_UNAVAILABLE", async () => {
    const { provider } = fakeProvider(async () => {
      throw new GitProviderUnavailableError({ operation: "listFiles" });
    });
    expect(await codeOf(specHeadPaths(provider, access, TARGET, "cadrage"))).toBe(
      "PROVIDER_UNAVAILABLE",
    );
    expect(await codeOf(specHeadPaths(null, access, TARGET, "cadrage"))).toBe(
      "PROVIDER_UNAVAILABLE",
    );
    const inactive = { ...TARGET, installation: { ...TARGET.installation, active: false } };
    const ok = fakeProvider(listing([])).provider;
    expect(await codeOf(specHeadPaths(ok, access, inactive, "cadrage"))).toBe(
      "PROVIDER_UNAVAILABLE",
    );
  });
});
