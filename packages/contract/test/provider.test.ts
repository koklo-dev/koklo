import { describe, expect, it } from "vitest";
import {
  INSTANT,
  input,
  installation,
  isValid,
  output,
  parsed,
  proc,
  repo,
  UUID,
  UUID2,
} from "./support.ts";

describe("P0 présence des procédures fournisseur", () => {
  it.each(["installation.list", "installation.start", "repo.list", "repo.link", "repo.createSpec"])(
    "%s existe",
    (name) => {
      expect(proc(name), name).toBeDefined();
    },
  );
});

describe("P1 installation.list", () => {
  const o = () => output("installation.list");
  it("sortie : tableau d'installations, sans identifiant externe", async () => {
    expect(await isValid(o(), [])).toBe(true);
    expect(await isValid(o(), [installation])).toBe(true);
    expect(await isValid(o(), [{ ...installation, ownerKind: "user", status: "suspended" }])).toBe(
      true,
    );
    expect(await isValid(o(), installation)).toBe(false);
  });
  it("listes fermées : provider, ownerKind, status, userAuthorization", async () => {
    for (const userAuthorization of ["absent", "active", "expired"]) {
      expect(await isValid(o(), [{ ...installation, userAuthorization }]), userAuthorization).toBe(
        true,
      );
    }
    for (const status of ["active", "suspended", "deleted"]) {
      expect(await isValid(o(), [{ ...installation, status }]), status).toBe(true);
    }
    expect(await isValid(o(), [{ ...installation, userAuthorization: "revoked" }])).toBe(false);
    expect(await isValid(o(), [{ ...installation, status: "pending" }])).toBe(false);
    expect(await isValid(o(), [{ ...installation, ownerKind: "team" }])).toBe(false);
    expect(await isValid(o(), [{ ...installation, provider: "gitlab" }])).toBe(false);
  });
  it("champs obligatoires et types", async () => {
    for (const field of Object.keys(installation)) {
      expect(await isValid(o(), [{ ...installation, [field]: undefined }]), field).toBe(false);
    }
    expect(await isValid(o(), [{ ...installation, id: "x" }])).toBe(false);
    expect(await isValid(o(), [{ ...installation, createdAt: "hier" }])).toBe(false);
  });
  it("n'expose jamais l'identifiant externe de l'installation", async () => {
    const value = (await parsed(o(), [{ ...installation, externalId: "12345" }])) as unknown as
      | Record<string, unknown>[]
      | undefined;
    expect(value === undefined || !("externalId" in (value[0] ?? {}))).toBe(true);
  });
});

describe("P2 installation.start", () => {
  const i = () => input("installation.start");
  it("entrée : installationId optionnel (uuid)", async () => {
    expect(await isValid(i(), {})).toBe(true);
    expect(await isValid(i(), { installationId: UUID })).toBe(true);
    expect(await isValid(i(), { installationId: "x" })).toBe(false);
    expect(await isValid(i(), { installationId: 12 })).toBe(false);
  });
  it("sortie : { url, expiresAt }, url absolue", async () => {
    const o = output("installation.start");
    const ok = {
      url: "https://github.com/apps/koklo/installations/new?state=abc",
      expiresAt: INSTANT,
    };
    expect(await isValid(o, ok)).toBe(true);
    expect(await isValid(o, { ...ok, url: "pas une url" })).toBe(false);
    expect(await isValid(o, { ...ok, expiresAt: "bientôt" })).toBe(false);
    expect(await isValid(o, { url: ok.url })).toBe(false);
    expect(await isValid(o, { expiresAt: INSTANT })).toBe(false);
  });
});

describe("P3 repo.list", () => {
  it("entrée : projectId uuid obligatoire (explicite)", async () => {
    const i = input("repo.list");
    expect(await isValid(i, { projectId: UUID })).toBe(true);
    expect(await isValid(i, {})).toBe(false);
    expect(await isValid(i, { projectId: "x" })).toBe(false);
  });
  it("sortie : tableau de dépôts, specPath nullable", async () => {
    const o = output("repo.list");
    expect(await isValid(o, [])).toBe(true);
    expect(await isValid(o, [repo])).toBe(true);
    expect(await isValid(o, [{ ...repo, specPath: "docs/spec" }])).toBe(true);
    expect(await isValid(o, [{ ...repo, role: "back", mode: "adopted" }])).toBe(true);
    expect(await isValid(o, [{ ...repo, specPath: undefined }])).toBe(false);
    expect(await isValid(o, [{ ...repo, role: "infra" }])).toBe(false);
    expect(await isValid(o, [{ ...repo, mode: "cloned" }])).toBe(false);
    expect(await isValid(o, [{ ...repo, projectId: "x" }])).toBe(false);
    expect(await isValid(o, [{ ...repo, installationId: "x" }])).toBe(false);
    for (const field of ["id", "name", "ownerLogin", "defaultBranch", "role", "mode"]) {
      expect(await isValid(o, [{ ...repo, [field]: undefined }]), field).toBe(false);
    }
  });
});

describe("P4 repo.link", () => {
  const i = () => input("repo.link");
  const link = {
    projectId: UUID,
    installationId: UUID2,
    role: "front",
    ownerLogin: "koklo-hq",
    name: "web",
  };
  it("accepte un dépôt existant, specPath optionnel", async () => {
    expect(await isValid(i(), link)).toBe(true);
    expect(await isValid(i(), { ...link, specPath: "spec" })).toBe(true);
  });
  it("refuse uuid mal formé, rôle hors REPO_ROLES, champs absents ou vides", async () => {
    expect(await isValid(i(), { ...link, projectId: "x" })).toBe(false);
    expect(await isValid(i(), { ...link, installationId: "x" })).toBe(false);
    expect(await isValid(i(), { ...link, role: "infra" })).toBe(false);
    for (const role of ["spec", "front", "back", "monorepo", "mobile"]) {
      expect(await isValid(i(), { ...link, role }), role).toBe(true);
    }
    for (const field of ["projectId", "installationId", "role", "ownerLogin", "name"]) {
      expect(await isValid(i(), { ...link, [field]: undefined }), field).toBe(false);
    }
    expect(await isValid(i(), { ...link, name: "" })).toBe(false);
    expect(await isValid(i(), { ...link, ownerLogin: "" })).toBe(false);
  });
  it("sortie : le dépôt lié", async () => {
    expect(await isValid(output("repo.link"), { ...repo, mode: "adopted" })).toBe(true);
    expect(await isValid(output("repo.link"), [repo])).toBe(false);
    expect(await isValid(output("repo.link"), { ...repo, role: "x" })).toBe(false);
  });
});

describe("P5 repo.createSpec", () => {
  const i = () => input("repo.createSpec");
  const create = { projectId: UUID, installationId: UUID2 };
  it("entrée : nom optionnel ; projectId et installationId obligatoires", async () => {
    expect(await isValid(i(), create)).toBe(true);
    expect(await isValid(i(), { ...create, name: "mon-projet-spec" })).toBe(true);
    expect(await isValid(i(), { ...create, name: "" })).toBe(false);
    expect(await isValid(i(), { installationId: UUID2 })).toBe(false);
    expect(await isValid(i(), { projectId: UUID })).toBe(false);
    expect(await isValid(i(), { ...create, projectId: "x" })).toBe(false);
    expect(await isValid(i(), { ...create, installationId: "x" })).toBe(false);
  });
  it("la visibilité n'est pas paramétrable : toujours privée (§5.1)", async () => {
    const value = await parsed(i(), { ...create, visibility: "public" });
    expect(value === undefined || !("visibility" in value)).toBe(true);
  });
  it("sortie : le dépôt créé", async () => {
    expect(await isValid(output("repo.createSpec"), repo)).toBe(true);
    expect(await isValid(output("repo.createSpec"), { ...repo, id: "x" })).toBe(false);
  });
});
