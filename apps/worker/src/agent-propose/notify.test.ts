import { describe, expect, it } from "vitest";
import { isAway } from "./notify.ts";

/** TK-99a lot B : l'utilisateur est parti quand la liste n'a pas été lue depuis plus de 30 secondes. */
const NOW = new Date("2026-11-11T12:00:00.000Z");
const ago = (seconds: number) => new Date(NOW.getTime() - seconds * 1000);

describe("isAway", () => {
  it("dernière lecture il y a plus de 30 s : parti", () => {
    expect(isAway({ lastSeenAt: ago(31), startedAt: ago(40) }, NOW)).toBe(true);
  });
  it("dernière lecture il y a 30 s ou moins : présent", () => {
    expect(isAway({ lastSeenAt: ago(30), startedAt: ago(600) }, NOW)).toBe(false);
    expect(isAway({ lastSeenAt: ago(5), startedAt: ago(600) }, NOW)).toBe(false);
  });
  it("jamais lue : mesuré depuis le début du traitement", () => {
    expect(isAway({ lastSeenAt: null, startedAt: ago(120) }, NOW)).toBe(true);
    expect(isAway({ lastSeenAt: null, startedAt: ago(10) }, NOW)).toBe(false);
  });
  it("ni lecture ni début : rien ne dit qu'il est parti", () => {
    expect(isAway({ lastSeenAt: null, startedAt: null }, NOW)).toBe(false);
  });
});
