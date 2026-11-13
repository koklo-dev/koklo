import { describe, expect, it } from "vitest";
import {
  anchorScroll,
  fitZoom,
  nextZoom,
  previousZoom,
  ZOOM_STEPS,
  zoomPercent,
} from "../src/lib/diagram-zoom.ts";

/** TK-108 lot A : paliers, « Ajuster » et ancrage du zoom (B425, maquette 11 l.455-469). */
describe("diagram-zoom", () => {
  it("les paliers vont de 50 à 200 %", () => {
    expect([...ZOOM_STEPS]).toEqual([0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2]);
  });

  it("zoomer monte d'un palier et s'arrête à 200 %", () => {
    expect(nextZoom(1)).toBe(1.1);
    expect(nextZoom(1.5)).toBe(2);
    expect(nextZoom(2)).toBe(2);
  });

  it("dézoomer descend d'un palier et s'arrête à 50 %", () => {
    expect(previousZoom(1)).toBe(0.9);
    expect(previousZoom(0.67)).toBe(0.5);
    expect(previousZoom(0.5)).toBe(0.5);
  });

  it("depuis un niveau d'« Ajuster » (hors palier), le palier voisin le plus proche dans le sens voulu", () => {
    expect(nextZoom(0.83)).toBe(0.9);
    expect(previousZoom(0.83)).toBe(0.75);
  });

  it("« Ajuster » = min(largeur utile / largeur du plan, hauteur utile / hauteur du plan), 2 décimales", () => {
    expect(fitZoom({ width: 812, height: 812 }, { width: 760, height: 790 })).toBe(1.03);
    expect(fitZoom({ width: 600, height: 400 }, { width: 750, height: 420 })).toBe(0.8);
  });

  it("« Ajuster » reste entre 50 et 200 %, et vaut 100 % sans mesure", () => {
    expect(fitZoom({ width: 100, height: 100 }, { width: 760, height: 790 })).toBe(0.5);
    expect(fitZoom({ width: 5000, height: 5000 }, { width: 100, height: 100 })).toBe(2);
    expect(fitZoom({ width: 0, height: 0 }, { width: 760, height: 790 })).toBe(1);
  });

  it("annonce un pourcentage entier", () => {
    expect(zoomPercent(1.1)).toBe(110);
    expect(zoomPercent(0.67)).toBe(67);
  });

  it("garde le point sous le pointeur au même endroit", () => {
    expect(
      anchorScroll({ from: 1, to: 2, pointer: { x: 100, y: 50 }, scroll: { left: 0, top: 0 } }),
    ).toEqual({ left: 100, top: 50 });
    expect(
      anchorScroll({ from: 2, to: 1, pointer: { x: 100, y: 50 }, scroll: { left: 300, top: 100 } }),
    ).toEqual({ left: 100, top: 25 });
  });

  it("ne rend jamais un défilement négatif", () => {
    expect(
      anchorScroll({ from: 2, to: 0.5, pointer: { x: 400, y: 400 }, scroll: { left: 0, top: 0 } }),
    ).toEqual({ left: 0, top: 0 });
  });
});
