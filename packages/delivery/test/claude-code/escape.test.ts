/** B2 : un petit-fils qui garde stdout ouvert (dans le groupe ou hors du groupe) ne bloque jamais la promesse. */
import { revealUntrusted } from "@koklo/domain";
import { describe, expect, it } from "vitest";
import { BUDGET, makeRequest } from "../agent-helpers.ts";
import {
  isAlive,
  killSurvivor,
  makeRuntime,
  makeSandbox,
  recordedPid,
  script,
  waitDead,
  waitForPidFile,
} from "./support.ts";

const PENDING = Symbol("pending");

/** Rend la valeur de `promise` ou PENDING si elle ne se resout pas avant `ms`. */
const within = <T>(promise: Promise<T>, ms: number): Promise<T | typeof PENDING> =>
  Promise.race([promise, new Promise<typeof PENDING>((done) => setTimeout(done, ms, PENDING))]);

describe("petit-fils qui garde stdout ouvert", () => {
  it("dans le groupe : la session rend `completed` sans attendre le petit-fils (5 s)", async () => {
    const sandbox = makeSandbox();
    script(sandbox, { scenario: "lingering", text: "resultat-final" });
    const started = Date.now();
    const result = await within(
      makeRuntime(sandbox).launchSession(makeRequest({ worktree: sandbox.worktree })),
      3_000,
    );
    expect(result).not.toBe(PENDING);
    expect(Date.now() - started).toBeLessThan(3_000);
    if (result !== PENDING) {
      expect(result.status).toBe("completed");
      expect(revealUntrusted(result.output)).toBe("resultat-final");
    }
    const grandchild = await waitForPidFile(sandbox, "grandchild.pid");
    expect(await waitDead(grandchild)).toBe(true); // le groupe est tue a la fin du fils
  });

  it("hors du groupe (setsid) : le timeout rend la main malgre le pipe tenu ouvert", async () => {
    const sandbox = makeSandbox();
    script(sandbox, { scenario: "escape", text: "partiel" });
    const request = makeRequest({
      worktree: sandbox.worktree,
      budget: { ...BUDGET, timeoutMs: 500 },
    });
    const pending = makeRuntime(sandbox, { killGraceMs: 200 }).launchSession(request);
    const escaped = await waitForPidFile(sandbox, "grandchild.pid");
    try {
      const result = await within(pending, 3_000);
      expect(result).not.toBe(PENDING);
      if (result !== PENDING) {
        expect(result.status).toBe("timeout");
      }
      expect(await waitDead(recordedPid(sandbox))).toBe(true);
      // limite assumee (ADR 0014) : setsid echappe au groupe, il faut une isolation cgroup/conteneur
      expect(isAlive(escaped)).toBe(true);
    } finally {
      await killSurvivor(escaped);
    }
  });
});
