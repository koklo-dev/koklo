import { describe, expect, it } from "vitest";
import {
  BLOCK_CAUSES,
  createBlock,
  InvalidRunEventError,
  isBlockCause,
  isRunState,
  isTerminal,
  RUN_EVENT_TYPES,
  RUN_STATES,
} from "../src/index.ts";
import { EVENT_TYPES, STATES, TERMINAL_STATES } from "./helpers.ts";

const CAUSES = [
  "dependency",
  "ambiguous_spec",
  "ci_failed",
  "conflict",
  "quota",
  "review_exhausted",
  "no_output",
  "git_error",
  "ci_timeout",
] as const;

describe("états du run (vision §10.3, §C.6)", () => {
  it("expose la liste figée des 11 états, dans l'ordre de la vision", () => {
    expect([...RUN_STATES]).toEqual([...STATES]);
  });

  it("isRunState accepte les 11 états et refuse le reste", () => {
    for (const state of STATES) expect(isRunState(state), state).toBe(true);
    for (const bad of ["ci_timeout", "LEASED", "", null, undefined, 3, {}]) {
      expect(isRunState(bad), String(bad)).toBe(false);
    }
  });

  it("isTerminal : seuls deployed_staging et escalated sont terminaux (merged et blocked ne le sont pas)", () => {
    for (const state of STATES)
      expect(isTerminal(state), state).toBe(TERMINAL_STATES.includes(state));
  });

  it("expose la liste figée des types d'événements", () => {
    expect([...RUN_EVENT_TYPES].sort()).toEqual([...EVENT_TYPES].sort());
  });
});

describe("causes de blocage typées (décisions D1, D3)", () => {
  it("expose la liste figée des 9 causes, dont ci_timeout distincte de ci_failed", () => {
    expect([...BLOCK_CAUSES]).toEqual([...CAUSES]);
  });

  it("isBlockCause accepte les 9 causes et refuse le reste (pas de cause fourre-tout)", () => {
    for (const cause of CAUSES) expect(isBlockCause(cause), cause).toBe(true);
    for (const bad of ["unknown", "other", "timeout", "", null, 1]) {
      expect(isBlockCause(bad), String(bad)).toBe(false);
    }
  });

  it("chaque cause est constructible et porte la sortie brute", () => {
    for (const cause of CAUSES) {
      if (cause === "no_output") continue;
      expect(createBlock(cause, "raw output")).toEqual({ cause, detail: { output: "raw output" } });
    }
  });

  it("no_output expose remoteBranchExists (vrai comme faux) et l'exige", () => {
    expect(createBlock("no_output", "empty diff", { remoteBranchExists: true })).toEqual({
      cause: "no_output",
      detail: { output: "empty diff", remoteBranchExists: true },
    });
    expect(createBlock("no_output", "empty diff", { remoteBranchExists: false }).detail).toEqual({
      output: "empty diff",
      remoteBranchExists: false,
    });
    expect(() => createBlock("no_output", "empty diff")).toThrow(InvalidRunEventError);
  });

  it("refuse une sortie vide ou non textuelle, et une cause inconnue", () => {
    for (const output of ["", "   ", undefined, null, 42]) {
      expect(() => createBlock("git_error", output), String(output)).toThrow(InvalidRunEventError);
    }
    expect(() => createBlock("whatever", "out")).toThrow(InvalidRunEventError);
  });

  it("la valeur construite est gelée", () => {
    const block = createBlock("conflict", "CONFLICT in a.ts");
    expect(Object.isFrozen(block)).toBe(true);
    expect(Object.isFrozen(block.detail)).toBe(true);
  });
});
