import { describe, expect, it } from "vitest";
import { applyEvent, type Run, startRun } from "../src/index.ts";
import { deepFreeze, event, LIMITS, runAt } from "./helpers.ts";

describe("Run immuable", () => {
  it("startRun et applyEvent renvoient des valeurs gelées (y compris blocked)", () => {
    expect(Object.isFrozen(startRun({ ticket: "TK-72" }))).toBe(true);
    const step = applyEvent(runAt("leased"), event("worktree_ready"), LIMITS);
    expect(Object.isFrozen(step.run)).toBe(true);
    expect(Object.isFrozen(step.effects)).toBe(true);
    const blocked = applyEvent(runAt("developing"), event("block"), LIMITS).run;
    expect(Object.isFrozen(blocked.blocked)).toBe(true);
    expect(Object.isFrozen(blocked.blocked?.detail)).toBe(true);
  });

  it("toute mutation d'un run renvoyé échoue (mode strict)", () => {
    const run = startRun({ ticket: "TK-72" }) as { -readonly [K in keyof Run]: Run[K] };
    expect(() => {
      run.state = "merged";
    }).toThrow(TypeError);
    expect(() => {
      run.attempts = 9;
    }).toThrow(TypeError);
  });

  it("applyEvent ne mute pas son entrée (run profondément gelé accepté, copie inchangée)", () => {
    const run = deepFreeze(
      runAt("ci_wait", { branch: "b", pullRequest: "acme/app#1", version: 7 }),
    );
    const snapshot = structuredClone(run);
    const step = applyEvent(run, event("ci_red"), LIMITS);
    expect(run).toEqual(snapshot);
    expect(step.run).not.toBe(run);
    expect(step.run.version).toBe(8);
  });

  it("le run d'entrée n'est pas modifié non plus quand il n'est pas gelé", () => {
    const run = runAt("local_gates");
    const snapshot = structuredClone(run);
    applyEvent(run, event("gates_green"), LIMITS);
    expect(run).toEqual(snapshot);
  });

  it("applyEvent est déterministe : mêmes entrées, mêmes sorties", () => {
    const run = runAt("reviewing", { version: 2 });
    expect(applyEvent(run, event("verdict_approve"), LIMITS)).toEqual(
      applyEvent(run, event("verdict_approve"), LIMITS),
    );
  });
});

describe("Run sérialisable", () => {
  it("survit à un aller-retour JSON, à tous les états", () => {
    const run = applyEvent(runAt("developing"), event("block"), LIMITS).run;
    expect(JSON.parse(JSON.stringify(run))).toEqual(run);
    const started = startRun({ ticket: "TK-72" });
    expect(JSON.parse(JSON.stringify(started))).toEqual(started);
  });

  it("une machine rechargée depuis le JSON continue comme l'originale", () => {
    const original = applyEvent(startRun({ ticket: "TK-72" }), event("worktree_ready"), LIMITS).run;
    const reloaded = JSON.parse(JSON.stringify(original)) as Run;
    expect(applyEvent(reloaded, event("dev_done"), LIMITS)).toEqual(
      applyEvent(original, event("dev_done"), LIMITS),
    );
  });

  it("ne contient que des types JSON simples (aucune Date, fonction ou undefined)", () => {
    const run = applyEvent(runAt("pr_open"), event("pr_opened"), LIMITS).run;
    for (const value of Object.values(run)) {
      expect(["string", "number", "boolean", "object"]).toContain(typeof value);
    }
    expect(Object.values(run).every((value) => value !== undefined)).toBe(true);
  });
});
