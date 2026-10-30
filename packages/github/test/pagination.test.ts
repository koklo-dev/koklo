import { GitProviderError } from "@koklo/domain";
import { describe, expect, it } from "vitest";
import {
  caught,
  createMockGitHub,
  installationAuth,
  providerOn,
  repoRef,
} from "./support/mock-github.ts";

const LIST = "GET /repos/acme/demo/deployments";
const deployment = (id: number) => ({
  id,
  environment: "staging",
  sha: `sha${id}`,
  ref: "main",
  created_at: "2026-10-30T10:00:00Z",
});
const list = (provider: ReturnType<typeof providerOn>) =>
  provider.listDeployments({ auth: installationAuth(), repo: repoRef, ref: "main" });
const next = (page: number) => ({
  link: `<https://api.github.com/repos/acme/demo/deployments?ref=main&per_page=100&page=${page}>; rel="next"`,
});

describe("CA6 pagination interne de listDeployments", () => {
  it("rend les éléments de 3 pages en un seul tableau, en 100 par page", async () => {
    const mock = createMockGitHub({
      [LIST]: (request) => {
        const page = Number(request.query.get("page") ?? "1");
        return {
          body: [deployment(page * 10), deployment(page * 10 + 1)],
          headers: page < 3 ? next(page + 1) : {},
        };
      },
      "GET /repos/acme/demo/deployments/10/statuses": {
        body: [{ state: "success", environment_url: "https://s.test" }],
      },
      "GET /repos/acme/demo/deployments/11/statuses": { body: [] },
      "GET /repos/acme/demo/deployments/20/statuses": { body: [{ state: "failure" }] },
      "GET /repos/acme/demo/deployments/21/statuses": { body: [{ state: "in_progress" }] },
      "GET /repos/acme/demo/deployments/30/statuses": { body: [{ state: "inactive" }] },
      "GET /repos/acme/demo/deployments/31/statuses": { body: [{ state: "error" }] },
    });
    const deployments = await list(providerOn(mock));
    expect(deployments.map((d) => d.id)).toEqual(["10", "11", "20", "21", "30", "31"]);
    expect(mock.count(LIST)).toBe(3);
    expect(mock.requests.find((r) => r.path.endsWith("/deployments"))?.query.get("per_page")).toBe(
      "100",
    );
    expect(deployments[0]).toMatchObject({
      state: "success",
      url: "https://s.test",
      environment: "staging",
    });
    expect(deployments[1]?.state).toBe("pending");
    expect(JSON.stringify(deployments)).not.toMatch(/page=|rel="next"/);
  });

  it("borne de sécurité : au plus 50 pages lues, puis GitProviderError explicite", async () => {
    const mock = createMockGitHub({
      [LIST]: (request) => ({
        body: [],
        headers: next(Number(request.query.get("page") ?? "1") + 1),
      }),
    });
    const error = await caught(list(providerOn(mock)));
    expect(error).toBeInstanceOf(GitProviderError);
    expect(error).toMatchObject({ operation: "listDeployments" });
    expect(mock.count(LIST)).toBe(50);
  });

  it("la borne est configurable (maxPages)", async () => {
    const mock = createMockGitHub({
      [LIST]: (request) => ({
        body: [],
        headers: next(Number(request.query.get("page") ?? "1") + 1),
      }),
    });
    await caught(list(providerOn(mock, { maxPages: 2 })));
    expect(mock.count(LIST)).toBe(2);
  });

  it("liste vide : tableau vide", async () => {
    const mock = createMockGitHub({ [LIST]: { body: [] } });
    expect(await list(providerOn(mock))).toEqual([]);
  });
});
