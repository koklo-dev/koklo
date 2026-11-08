import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createIdeaSaver, type IdeaSaverDeps } from "../src/lib/idea-saver.ts";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(
  save: IdeaSaverDeps["save"] = async ({ baseVersion }) => ({ version: baseVersion + 1 }),
) {
  const states: string[] = [];
  const conflicts: Array<{ mine: string; currentVersion: number }> = [];
  const local: Array<[string, number]> = [];
  const cleared = vi.fn();
  const saveSpy = vi.fn(save);
  const saver = createIdeaSaver(
    {
      save: saveSpy,
      onState: (s) => states.push(s),
      onConflict: (c) => conflicts.push(c),
      persistLocal: (md, v) => local.push([md, v]),
      clearLocal: cleared,
    },
    { version: 3, contentMd: "" },
  );
  return { saver, saveSpy, states, conflicts, local, cleared };
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("T20 enregistrement automatique", () => {
  it("n'envoie que 1,5 s après la dernière frappe, une seule fois", async () => {
    const { saver, saveSpy } = setup();
    saver.change("a");
    await vi.advanceTimersByTimeAsync(1000);
    saver.change("ab");
    await vi.advanceTimersByTimeAsync(1000);
    expect(saveSpy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy).toHaveBeenCalledWith({ contentMd: "ab", baseVersion: 3 });
  });

  it("la perte de focus envoie tout de suite", async () => {
    const { saver, saveSpy } = setup();
    saver.change("a");
    await saver.flush();
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  it("indicateurs : Enregistrement puis Brouillon enregistré, copie locale effacée", async () => {
    const { saver, states, cleared } = setup();
    saver.change("a");
    await saver.flush();
    expect(states).toEqual(["saving", "saved"]);
    expect(cleared).toHaveBeenCalled();
  });

  it("copie locale à chaque frappe avec la version de base", () => {
    const { saver, local } = setup();
    saver.change("a");
    saver.change("ab");
    expect(local).toEqual([
      ["a", 3],
      ["ab", 3],
    ]);
  });

  it("réseau coupé : hors ligne, copie gardée, nouvel essai possible", async () => {
    let fail = true;
    const { saver, states, cleared } = setup(async ({ baseVersion }) => {
      if (fail) throw new TypeError("Failed to fetch");
      return { version: baseVersion + 1 };
    });
    saver.change("a");
    await saver.flush();
    expect(states.at(-1)).toBe("offline");
    expect(cleared).not.toHaveBeenCalled();
    fail = false;
    await saver.retry();
    expect(states.at(-1)).toBe("saved");
  });

  it("une frappe pendant l'envoi part ensuite sur la version reçue", async () => {
    let typed = false;
    const ref: { saver?: ReturnType<typeof setup>["saver"] } = {};
    const ctx = setup(async ({ baseVersion }) => {
      if (!typed) {
        typed = true;
        ref.saver?.change("ab");
      }
      return { version: baseVersion + 1 };
    });
    ref.saver = ctx.saver;
    ctx.saver.change("a");
    await ctx.saver.flush();
    await vi.advanceTimersByTimeAsync(1600);
    expect(ctx.saveSpy).toHaveBeenLastCalledWith({ contentMd: "ab", baseVersion: 4 });
  });
});

describe("T19 conflit : la saisie n'est jamais perdue", () => {
  const conflict = () =>
    Object.assign(new Error("conflit"), { code: "CONFLICT", data: { currentVersion: 7 } });

  it("garde la saisie, annonce la version courante, cesse d'envoyer", async () => {
    const { saver, saveSpy, conflicts, states, cleared } = setup(async () => {
      throw conflict();
    });
    saver.change("ma saisie");
    await saver.flush();
    expect(states.at(-1)).toBe("conflict");
    expect(conflicts).toEqual([{ mine: "ma saisie", currentVersion: 7 }]);
    expect(cleared).not.toHaveBeenCalled();
    saver.change("ma saisie encore");
    await vi.advanceTimersByTimeAsync(5000);
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  it("« Garder la mienne » renvoie la saisie sur la version courante", async () => {
    let first = true;
    const { saver, saveSpy } = setup(async ({ baseVersion }) => {
      if (first) {
        first = false;
        throw conflict();
      }
      return { version: baseVersion + 1 };
    });
    saver.change("ma saisie");
    await saver.flush();
    await saver.keepMine(7);
    expect(saveSpy).toHaveBeenLastCalledWith({ contentMd: "ma saisie", baseVersion: 7 });
  });

  it("« Prendre la leur » efface la copie locale sans envoi", async () => {
    const { saver, saveSpy, cleared } = setup(async () => {
      throw conflict();
    });
    saver.change("ma saisie");
    await saver.flush();
    saver.takeTheirs(7, "leur texte");
    expect(cleared).toHaveBeenCalled();
    await saver.flush();
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });
});
