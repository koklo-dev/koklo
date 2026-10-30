import { GitConflictError } from "@koklo/domain";
import { describe, expect, it } from "vitest";
import {
  caught,
  createMockGitHub,
  installationAuth,
  providerOn,
  prRef,
} from "./support/mock-github.ts";

const PR = "GET /repos/acme/demo/pulls/7";
const MERGE = "PUT /repos/acme/demo/pulls/7/merge";
const openPr = (sha: string) => ({
  body: {
    number: 7,
    state: "open",
    merged: false,
    mergeable: true,
    head: { sha, ref: "feat" },
    base: { ref: "main" },
  },
});
const merge = (provider: ReturnType<typeof providerOn>, expectedHeadSha: string) =>
  provider.mergePullRequest({
    auth: installationAuth(),
    pullRequest: prRef,
    method: "squash",
    expectedHeadSha,
  });

describe("CA7 mergePullRequest compare la tête avant de fusionner", () => {
  it("tête différente de expectedHeadSha : stale-sha et aucune écriture", async () => {
    const mock = createMockGitHub({
      [PR]: openPr("aaa111"),
      [MERGE]: { body: { merged: true, sha: "m1" } },
    });
    const error = await caught(merge(providerOn(mock), "bbb222"));
    expect(error).toBeInstanceOf(GitConflictError);
    expect((error as GitConflictError).reason).toBe("stale-sha");
    expect(mock.writes()).toEqual([]);
  });

  it("tête identique : PUT merge avec le paramètre natif sha et la méthode demandée", async () => {
    const mock = createMockGitHub({
      [PR]: openPr("aaa111"),
      [MERGE]: { body: { merged: true, sha: "m1" } },
    });
    const result = await merge(providerOn(mock), "aaa111");
    expect(result).toEqual({ sha: "m1" });
    const writes = mock.writes();
    expect(writes).toHaveLength(1);
    expect(writes[0]?.body).toMatchObject({ sha: "aaa111", merge_method: "squash" });
  });

  it("la lecture de la PR précède l'écriture", async () => {
    const mock = createMockGitHub({
      [PR]: openPr("aaa111"),
      [MERGE]: { body: { merged: true, sha: "m1" } },
    });
    await merge(providerOn(mock), "aaa111");
    const order = mock.requests.map((r) => `${r.method} ${r.path}`);
    expect(order.indexOf(PR)).toBeGreaterThanOrEqual(0);
    expect(order.indexOf(PR)).toBeLessThan(order.indexOf(MERGE));
  });

  it("409 de GitHub (tête déplacée entre la lecture et la fusion) : stale-sha", async () => {
    const mock = createMockGitHub({
      [PR]: openPr("aaa111"),
      [MERGE]: {
        status: 409,
        body: { message: "Head branch was modified. Review and try the merge again." },
      },
    });
    const error = await caught(merge(providerOn(mock), "aaa111"));
    expect(error).toBeInstanceOf(GitConflictError);
    expect((error as GitConflictError).reason).toBe("stale-sha");
  });

  it("405 de GitHub : not-mergeable", async () => {
    const mock = createMockGitHub({
      [PR]: openPr("aaa111"),
      [MERGE]: { status: 405, body: { message: "Pull Request is not mergeable" } },
    });
    const error = await caught(merge(providerOn(mock), "aaa111"));
    expect(error).toBeInstanceOf(GitConflictError);
    expect((error as GitConflictError).reason).toBe("not-mergeable");
  });

  it("une écriture de merge en 502 n'est jamais rejouée, même avec des retries configurés", async () => {
    const mock = createMockGitHub({ [PR]: openPr("aaa111"), [MERGE]: { status: 502, body: {} } });
    await caught(merge(providerOn(mock, { retries: 3, retryBaseDelayMs: 1 }), "aaa111"));
    expect(mock.count(MERGE)).toBe(1);
  });
});
