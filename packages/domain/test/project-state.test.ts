import { describe, expect, it } from "vitest";
import {
  createProjectState,
  InvalidProjectStateVersionError,
  type ProjectState,
  StaleProjectStateError,
  writeProjectState,
} from "../src/index.ts";
import { throwsA } from "./clock-helpers.ts";

const stateAt = (version: number, content: unknown): ProjectState<unknown> => ({
  version,
  content,
});

describe("CA4 état de projet versionné", () => {
  it("S6 : l'état initial a la version 1", () => {
    const state = createProjectState({ a: 1 });
    expect(state).toEqual({ version: 1, content: { a: 1 } });
    expect(Object.isFrozen(state)).toBe(true);
  });

  it("S1 : écriture avec la version attendue : v+1, ancien état intact", () => {
    const v1 = createProjectState({ a: 1 });
    const v2 = writeProjectState(v1, 1, { a: 2 });
    expect(v2).toEqual({ version: 2, content: { a: 2 } });
    expect(v1).toEqual({ version: 1, content: { a: 1 } });
    expect(Object.isFrozen(v2)).toBe(true);
  });

  it("S2 : version périmée refusée avec l'état courant exact", () => {
    const current = stateAt(3, { stack: "node" });
    try {
      writeProjectState(current, 2, { stack: "go" });
      expect.unreachable("StaleProjectStateError attendue");
    } catch (error) {
      expect(error).toBeInstanceOf(StaleProjectStateError);
      const stale = error as StaleProjectStateError;
      expect(stale.current).toEqual({ version: 3, content: { stack: "node" } });
      expect(stale.expected).toBe(2);
    }
    expect(current).toEqual({ version: 3, content: { stack: "node" } });
  });

  it("S3 : version attendue future refusée aussi", () => {
    throwsA(() => writeProjectState(stateAt(3, {}), 5, {}), StaleProjectStateError);
  });
});

describe("CA4 état de projet : conflits et validation", () => {
  it("S4 : lu, conflit, relu, réécrit", () => {
    const v1 = createProjectState({ n: 0 });
    const v2 = writeProjectState(v1, 1, { n: 1 });
    let conflict: StaleProjectStateError | undefined;
    try {
      writeProjectState(v2, 1, { n: 99 });
    } catch (error) {
      conflict = error as StaleProjectStateError;
    }
    expect(conflict).toBeInstanceOf(StaleProjectStateError);
    expect(conflict?.current.version).toBe(2);
    const v3 = writeProjectState(conflict?.current as ProjectState<unknown>, 2, { n: 2 });
    expect(v3).toEqual({ version: 3, content: { n: 2 } });
  });

  it.each([0, -1, 1.5, Number.NaN, "2", null, undefined])(
    "S5 : version attendue %s invalide",
    (bad) => {
      throwsA(
        () => writeProjectState(createProjectState({}), bad as number, {}),
        InvalidProjectStateVersionError,
      );
    },
  );

  it("S5 : le contenu est remplacé, jamais fusionné", () => {
    const v2 = writeProjectState(createProjectState({ a: 1, b: 2 }), 1, { c: 3 });
    expect(v2.content).toEqual({ c: 3 });
  });

  it("S6 : l'état fourni avec une version invalide est refusé", () => {
    throwsA(() => writeProjectState(stateAt(0, {}), 0, {}), InvalidProjectStateVersionError);
  });
});
