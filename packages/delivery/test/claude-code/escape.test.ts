/** B2 : un petit-fils qui garde stdout ouvert (dans le groupe ou hors du groupe) ne bloque jamais la promesse. */
import { revealUntrusted } from "@koklo/domain";
import { describe, expect, it } from "vitest";
import { BUDGET, makeRequest } from "../agent-helpers.ts";
import {
  isAlive,
  killSurvivor,
  launchTimedOut,
  makeRuntime,
  makeSandbox,
  recordedPid,
  script,
  waitDead,
  waitForPidFile,
} from "./support.ts";

describe("petit-fils qui garde stdout ouvert", () => {
  it("dans le groupe : la session rend `completed` sans attendre le petit-fils", async () => {
    const sandbox = makeSandbox();
    script(sandbox, { scenario: "lingering", text: "resultat-final" });
    // Le petit-fils dort 120 s : s'il retenait la session, le test expirerait. Aucune duree absolue
    // n'est assertee, donc la charge du runner n'y change rien.
    const result = await makeRuntime(sandbox).launchSession(
      makeRequest({ worktree: sandbox.worktree }),
    );
    expect(result.status).toBe("completed");
    expect(revealUntrusted(result.output)).toBe("resultat-final");
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
    // le minuteur ne part qu'une fois le fils pret et le petit-fils ne ; l'attente reste reelle
    try {
      const result = await launchTimedOut(
        makeRuntime(sandbox, { killGraceMs: 200 }),
        sandbox,
        request,
      );
      expect(result.status).toBe("timeout");
      expect(await waitDead(recordedPid(sandbox))).toBe(true);
      // limite assumee (ADR 0014) : setsid echappe au groupe, il faut une isolation cgroup/conteneur
      expect(isAlive(await waitForPidFile(sandbox, "grandchild.pid"))).toBe(true);
    } finally {
      await killSurvivor(await waitForPidFile(sandbox, "grandchild.pid"));
    }
  });
});
