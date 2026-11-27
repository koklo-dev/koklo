import {
  type GitProvider,
  GitProviderUnavailableError,
  type RepoRef,
  SCOPING_BRANCH,
} from "@koklo/domain";
import { describe, expect, it } from "vitest";
import {
  buildInitialSpecFiles,
  InvalidRepoNameError,
  isValidRepoName,
  ProvisionError,
  projectSlugOf,
  provisionSpecRepo,
  specRepoName,
} from "../src/index.ts";
import { InMemoryGitProvider } from "../src/testing/index.ts";

/**
 * TK-93 lot A (B302) : provisionnement du dépôt de spec et règles de nommage, extraits de l'API
 * pour être partagés avec le worker. Comportement inchangé ; les pannes lèvent `ProvisionError`.
 */
const ORG = { kind: "organization", login: "acme" } as const;
const REF: RepoRef = { owner: ORG, name: "portail-spec" };

const make = () => {
  let ids = 0;
  return new InMemoryGitProvider({
    now: () => new Date("2026-11-09T10:00:00.000Z"),
    nextId: () => String(++ids),
  });
};
const files = () =>
  buildInitialSpecFiles({
    projectName: "Portail",
    organizationSlug: "acme",
    projectSlug: "portail",
  });
/** Les trois seules opérations du provisionnement, déléguées au faux ; `over` en remplace certaines. */
const wrap = (
  provider: InMemoryGitProvider,
  over: Partial<Pick<GitProvider, "createRepo" | "writeCommit" | "createBranch">>,
): GitProvider =>
  ({
    createRepo: (request) => provider.createRepo(request),
    writeCommit: (request) => provider.writeCommit(request),
    createBranch: (request) => provider.createBranch(request),
    ...over,
  }) as GitProvider;
const authOf = async (provider: GitProvider) => {
  const auth = await provider.authenticate({ installation: { id: "1", owner: ORG } });
  return { create: auth, write: auth };
};

describe("TK-106 structure initiale au format v2", () => {
  it("manifeste spec_version 2, sections 01-*, design/rules.yaml, quality/scenarios, sans relations.yaml", () => {
    const written = files();
    const paths = written.map((file) => file.path);
    expect(written.find((file) => file.path === "koklo.project.yaml")?.content).toContain(
      "spec_version: 2\n",
    );
    for (const expected of [
      "architecture/overview/01-contexte.md",
      "tech/cahier-technique/01-objet.md",
      "design/rules.yaml",
      "quality/scenarios/.gitkeep",
    ]) {
      expect(paths).toContain(expected);
    }
    for (const gone of ["data/relations.yaml", ".koklo/rules.yaml", "tests/scenarios/.gitkeep"]) {
      expect(paths).not.toContain(gone);
    }
  });
});

describe("TK-111 dossiers de l'architecture", () => {
  it("composants, flux et décisions : dossiers vides gardés par un .gitkeep, aucune entité d'exemple", () => {
    const paths = files().map((file) => file.path);
    for (const directory of ["architecture/components", "architecture/flows", "architecture/adr"]) {
      expect(paths, directory).toContain(`${directory}/.gitkeep`);
    }
    const entities = paths.filter((path) =>
      /^architecture\/(components|flows|adr)\/(?!\.gitkeep$)/.test(path),
    );
    expect(entities).toEqual([]);
    expect(paths).toContain("architecture/overview/01-contexte.md");
  });
});

describe("TK-115 dossier des choix techniques", () => {
  it("tech/stack vide gardé par un .gitkeep ; la section 01 du cahier est inchangée", () => {
    const written = files();
    const paths = written.map((file) => file.path);
    expect(paths).toContain("tech/stack/.gitkeep");
    expect(paths.filter((path) => /^tech\/stack\/(?!\.gitkeep$)/.test(path))).toEqual([]);
    expect(paths).not.toContain("tech/environments.yaml");
    expect(written.find((file) => file.path === "tech/cahier-technique/01-objet.md")?.content).toBe(
      "# Cahier technique : objet\n\nÀ compléter pendant le cadrage : pile retenue, contraintes, environnements.\n",
    );
  });
});

describe("TK-93 noms de dépôt", () => {
  it("par défaut : <slug du projet>-spec ; le slug est borné pour laisser place au suffixe", () => {
    expect(specRepoName("Refonte du Portail", undefined)).toBe("refonte-du-portail-spec");
    expect(projectSlugOf("---")).toBe("projet");
    expect(specRepoName("x".repeat(300), undefined).length).toBeLessThanOrEqual(100);
  });

  it("nom demandé : accepté s'il est valide pour GitHub, sinon InvalidRepoNameError", () => {
    expect(specRepoName("P", "mon_depot.v2")).toBe("mon_depot.v2");
    for (const bad of [".", "..", "a.git", "a b", "é", "", "x".repeat(101)]) {
      expect(isValidRepoName(bad), bad).toBe(false);
      expect(() => specRepoName("P", bad), bad).toThrow(InvalidRepoNameError);
    }
  });
});

describe("TK-93 provisionSpecRepo", () => {
  it("crée un dépôt privé, un commit de structure, puis la branche cadrage", async () => {
    const provider = make();
    const created = await provisionSpecRepo(provider, await authOf(provider), {
      ref: REF,
      files: files(),
    });
    expect(created.ref).toEqual(REF);
    const { write } = await authOf(provider);
    const onBranch = await provider.readFile({
      auth: write,
      repo: REF,
      ref: SCOPING_BRANCH,
      path: "koklo.project.yaml",
    });
    expect(onBranch.content).toContain("portail");
  });

  it("une panne de createRepo lève ProvisionError(createRepo) avec l'erreur du port, sans dépôt orphelin signalé", async () => {
    const provider = make();
    const failure = new GitProviderUnavailableError({ operation: "createRepo" });
    const broken = wrap(provider, { createRepo: async () => Promise.reject(failure) });
    const orphans: string[] = [];
    const error = await provisionSpecRepo(
      broken,
      await authOf(provider),
      { ref: REF, files: files() },
      (_repo, step) => orphans.push(step),
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ProvisionError);
    expect(error).toMatchObject({ step: "createRepo", cause: failure });
    expect(orphans).toEqual([]);
  });

  it("une panne après createRepo signale le dépôt orphelin et nomme l'étape", async () => {
    const provider = make();
    const broken = wrap(provider, {
      writeCommit: async () =>
        Promise.reject(new GitProviderUnavailableError({ operation: "writeCommit" })),
    });
    const orphans: [string, string][] = [];
    const error = await provisionSpecRepo(
      broken,
      await authOf(provider),
      { ref: REF, files: files() },
      (repo, step) => orphans.push([repo.name, step]),
    ).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ step: "writeCommit" });
    expect(orphans).toEqual([["portail-spec", "writeCommit"]]);
  });

  it("le message de ProvisionError ne cite jamais le message de l'erreur du port", async () => {
    const secret = "ghs_SECRET_TOKEN_VALUE";
    const provider = make();
    const broken = wrap(provider, { createRepo: async () => Promise.reject(new Error(secret)) });
    const error = (await provisionSpecRepo(broken, await authOf(provider), {
      ref: REF,
      files: files(),
    }).catch((caught: unknown) => caught)) as Error;
    expect(error.message).not.toContain(secret);
  });
});
