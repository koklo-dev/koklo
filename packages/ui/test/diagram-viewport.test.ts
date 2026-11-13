import { describe, expect, it } from "vitest";
import { visibleRect } from "../src/lib/use-diagram-viewport.ts";

/** B478 : cadre visible de la mini-carte, en unités du plan. */
describe("visibleRect", () => {
  const plan = { width: 2000, height: 1000 };

  it("ramène le défilement et la taille du cadre au zoom", () => {
    const frame = { scrollLeft: 400, scrollTop: 100, clientWidth: 800, clientHeight: 400 };
    expect(visibleRect(frame, 2, plan)).toEqual({ x: 200, y: 50, width: 400, height: 200 });
  });

  it("borne au plan : un cadre plus grand que le plan le couvre en entier", () => {
    const frame = { scrollLeft: 0, scrollTop: 0, clientWidth: 5000, clientHeight: 5000 };
    expect(visibleRect(frame, 1, plan)).toEqual({ x: 0, y: 0, width: 2000, height: 1000 });
  });
});
