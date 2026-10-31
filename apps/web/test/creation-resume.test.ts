import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CREATION_RESUME_KEY,
  CREATION_RESUME_TTL_MS,
  clearCreationResume,
  readCreationResume,
  writeCreationResume,
} from "../src/lib/creation-resume.ts";

const NOW = Date.UTC(2026, 9, 31, 12, 0, 0);
const MARKER = {
  projectId: "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b01",
  projectName: "Alpha",
  installationId: "01900000-0000-7000-8000-0000000000e1",
  savedAt: NOW,
};
const raw = (value: unknown) => sessionStorage.setItem(CREATION_RESUME_KEY, JSON.stringify(value));

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("marqueur de reprise de création (sessionStorage, AC-48-21)", () => {
  it("la durée de vie est d'une heure", () => {
    expect(CREATION_RESUME_TTL_MS).toBe(60 * 60 * 1000);
  });

  it("écrit puis relit le marqueur", () => {
    writeCreationResume({ ...MARKER, repoName: "mon-depot" });
    expect(readCreationResume(NOW + 1_000)).toEqual({ ...MARKER, repoName: "mon-depot" });
  });

  it("n'écrit que les cinq champs prévus : aucun jeton, état, URL ni code", () => {
    writeCreationResume(MARKER);
    const stored = JSON.parse(sessionStorage.getItem(CREATION_RESUME_KEY) ?? "null");
    expect(Object.keys(stored).sort()).toEqual(
      ["installationId", "projectId", "projectName", "savedAt"].sort(),
    );
    expect(sessionStorage.length).toBe(1);
  });

  it("valide à 59 minutes, expiré à 61 minutes", () => {
    writeCreationResume(MARKER);
    expect(readCreationResume(NOW + 59 * 60_000)).not.toBeNull();
    expect(readCreationResume(NOW + 61 * 60_000)).toBeNull();
  });

  it("utilise l'horloge courante par défaut", () => {
    vi.useFakeTimers({ now: NOW });
    try {
      writeCreationResume({ ...MARKER, savedAt: Date.now() });
      vi.setSystemTime(NOW + 2 * CREATION_RESUME_TTL_MS);
      expect(readCreationResume()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("clearCreationResume efface le marqueur", () => {
    writeCreationResume(MARKER);
    clearCreationResume();
    expect(sessionStorage.getItem(CREATION_RESUME_KEY)).toBeNull();
    expect(readCreationResume(NOW)).toBeNull();
  });

  it("rien d'écrit : null", () => {
    expect(readCreationResume(NOW)).toBeNull();
  });

  it.each([
    ["JSON malformé", "{pas du json"],
    ["tableau", "[]"],
    ["null", "null"],
    ["chaîne", '"x"'],
  ])("marqueur illisible (%s) : ignoré sans erreur", (_label, value) => {
    sessionStorage.setItem(CREATION_RESUME_KEY, value);
    expect(readCreationResume(NOW)).toBeNull();
  });

  it.each([
    ["projectId pas un uuid", { ...MARKER, projectId: "pas-un-uuid" }],
    ["installationId pas un uuid", { ...MARKER, installationId: "42" }],
    ["projectName vide", { ...MARKER, projectName: "" }],
    ["projectName absent", { ...MARKER, projectName: undefined }],
    ["savedAt texte", { ...MARKER, savedAt: "hier" }],
    ["champ en trop (schéma strict)", { ...MARKER, accessToken: "ghu_secret" }],
    ["repoName non texte", { ...MARKER, repoName: 12 }],
  ])("marqueur invalide (%s) : ignoré", (_label, value) => {
    raw(value);
    expect(readCreationResume(NOW)).toBeNull();
  });

  it("sessionStorage indisponible : lecture, écriture et effacement ne lèvent jamais", () => {
    const boom = () => {
      throw new DOMException("denied", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(boom);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(boom);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(boom);
    expect(() => writeCreationResume(MARKER)).not.toThrow();
    expect(readCreationResume(NOW)).toBeNull();
    expect(() => clearCreationResume()).not.toThrow();
  });
});
