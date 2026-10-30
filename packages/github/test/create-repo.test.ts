import { UserTokenRequiredError } from "@koklo/domain";
import { describe, expect, it } from "vitest";
import {
  caught,
  createMockGitHub,
  installationAuth,
  ORG,
  PERSON,
  providerOn,
  userAuth,
} from "./support/mock-github.ts";

const repoBody = (owner: string, type: string) => ({
  body: {
    name: "demo",
    private: true,
    default_branch: "main",
    html_url: `https://github.com/${owner}/demo`,
    owner: { login: owner, type },
  },
});

describe("CA8 createRepo : propriétaire organisation ou utilisateur", () => {
  it("utilisateur + jeton d'installation : UserTokenRequiredError sans aucune requête", async () => {
    const mock = createMockGitHub();
    const error = await caught(
      providerOn(mock).createRepo({
        auth: installationAuth(),
        owner: PERSON,
        name: "demo",
        visibility: "private",
      }),
    );
    expect(error).toBeInstanceOf(UserTokenRequiredError);
    expect(error).toMatchObject({ owner: PERSON, operation: "createRepo" });
    expect(mock.requests).toEqual([]);
  });

  it("organisation : POST /orgs/{org}/repos, privé, avec un premier commit", async () => {
    const mock = createMockGitHub({ "POST /orgs/acme/repos": repoBody("acme", "Organization") });
    const repo = await providerOn(mock).createRepo({
      auth: installationAuth(),
      owner: ORG,
      name: "demo",
      visibility: "private",
    });
    expect(repo).toMatchObject({
      ref: { owner: ORG, name: "demo" },
      visibility: "private",
      defaultBranch: "main",
      htmlUrl: "https://github.com/acme/demo",
    });
    const [request] = mock.writes();
    expect(request?.body).toMatchObject({ name: "demo", private: true, auto_init: true });
    expect(request?.headers.authorization).toContain("iat-fake");
  });

  it("utilisateur + jeton utilisateur : POST /user/repos avec ce jeton", async () => {
    const mock = createMockGitHub({ "POST /user/repos": repoBody("octo", "User") });
    const repo = await providerOn(mock).createRepo({
      auth: userAuth("uat-fake"),
      owner: PERSON,
      name: "demo",
      visibility: "public",
    });
    expect(repo.ref.owner).toEqual(PERSON);
    const [request] = mock.writes();
    expect(request?.path).toBe("/user/repos");
    expect(request?.body).toMatchObject({ name: "demo", private: false });
    expect(request?.headers.authorization).toContain("uat-fake");
  });

  it("modèle fourni : POST /repos/{template}/generate", async () => {
    const mock = createMockGitHub({
      "POST /repos/acme/tpl/generate": repoBody("acme", "Organization"),
    });
    await providerOn(mock).createRepo({
      auth: installationAuth(),
      owner: ORG,
      name: "demo",
      visibility: "private",
      template: { owner: ORG, name: "tpl" },
    });
    expect(mock.count("POST /repos/acme/tpl/generate")).toBe(1);
    expect(mock.writes()[0]?.body).toMatchObject({ owner: "acme", name: "demo", private: true });
  });
});
