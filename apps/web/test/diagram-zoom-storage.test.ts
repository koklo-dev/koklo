import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readStoredZoom,
  writeStoredZoom,
  ZOOM_STORAGE_KEY,
} from "../src/lib/diagram-zoom-storage.ts";

/** TK-108 lot C, B425 : le zoom du diagramme est mémorisé par navigateur, sans jamais faire échouer la page. */
beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("zoom mémorisé du diagramme", () => {
  it("la clé est koklo:data-diagram-zoom", () => {
    expect(ZOOM_STORAGE_KEY).toBe("koklo:data-diagram-zoom");
  });

  it("rien d'enregistré : pas de zoom", () => {
    expect(readStoredZoom()).toBeUndefined();
  });

  it("relit un palier écrit", () => {
    writeStoredZoom(1.25);
    expect(window.localStorage.getItem(ZOOM_STORAGE_KEY)).toBe("1.25");
    expect(readStoredZoom()).toBe(1.25);
  });

  it.each(["0.8", "abc", "", "3", "0"])("ignore la valeur hors paliers « %s »", (value) => {
    window.localStorage.setItem(ZOOM_STORAGE_KEY, value);
    expect(readStoredZoom()).toBeUndefined();
  });

  it("le stockage indisponible ne lève rien, ni en lecture ni en écriture", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(readStoredZoom()).toBeUndefined();
    expect(() => writeStoredZoom(1.5)).not.toThrow();
  });
});
