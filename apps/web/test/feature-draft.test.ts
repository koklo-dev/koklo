import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAllFeatureStorage,
  clearDraft,
  clearPending,
  DRAFT_TTL_MS,
  draftKey,
  type FeatureDraft,
  PENDING_TTL_MS,
  pendingKey,
  readDraft,
  readPending,
  saveDraft,
  savePending,
} from "../src/lib/feature-draft.ts";
import { EMPTY_VALUES } from "../src/lib/feature-form.ts";
import { OTHER_PROJECT_ID, PROJECT_ID, SHA } from "./support/features.tsx";

/**
 * TK-48 / 48e : brouillon (clé `koklo:feature-draft:<projectId>:<F-nnn|new>`, 7 jours) et marqueur de suivi
 * (`koklo:feature-pending:<projectId>`, 24 h) en `localStorage`. Jamais bloquant : tout est en `try/catch`.
 */
const NOW = Date.parse("2026-10-31T12:00:00.000Z");
const draft = (over: Partial<FeatureDraft> = {}): FeatureDraft => ({
  values: { ...EMPTY_VALUES, title: "Brouillon" },
  baseline: null,
  baseCommitSha: null,
  idempotencyKey: null,
  savedAt: new Date(NOW).toISOString(),
  ...over,
});
const pending = (savedAt = new Date(NOW).toISOString()) => ({
  batchId: "01900000-0000-7000-8000-0000000000d1",
  kind: "create" as const,
  specId: "F-004",
  title: "Nouvelle",
  savedAt,
});

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("clés", () => {
  it("brouillon : koklo:feature-draft:<projectId>:<F-nnn|new>", () => {
    expect(draftKey(PROJECT_ID, "new")).toBe(`koklo:feature-draft:${PROJECT_ID}:new`);
    expect(draftKey(PROJECT_ID, "F-001")).toBe(`koklo:feature-draft:${PROJECT_ID}:F-001`);
  });

  it("marqueur de suivi : koklo:feature-pending:<projectId>", () => {
    expect(pendingKey(PROJECT_ID)).toBe(`koklo:feature-pending:${PROJECT_ID}`);
  });

  it("délais : 7 jours et 24 heures", () => {
    expect(DRAFT_TTL_MS).toBe(7 * 24 * 3600 * 1000);
    expect(PENDING_TTL_MS).toBe(24 * 3600 * 1000);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: un cas par comportement du stockage
describe("brouillon", () => {
  it("écrit puis relit le contenu tel quel (valeurs, référence, version, clé, date)", () => {
    const value = draft({
      baseline: { ...EMPTY_VALUES, title: "Avant" },
      baseCommitSha: SHA,
      idempotencyKey: "feature-abc",
    });
    expect(saveDraft(PROJECT_ID, "F-001", value)).toBe(true);
    expect(readDraft(PROJECT_ID, "F-001", NOW + 1000)).toEqual(value);
  });

  it("un brouillon par projet et par cible", () => {
    saveDraft(PROJECT_ID, "new", draft());
    expect(readDraft(PROJECT_ID, "F-001", NOW)).toBeNull();
    expect(readDraft(OTHER_PROJECT_ID, "new", NOW)).toBeNull();
    expect(readDraft(PROJECT_ID, "new", NOW)).not.toBeNull();
  });

  it("expire après 7 jours : absent et supprimé du stockage ; juste avant : conservé", () => {
    saveDraft(PROJECT_ID, "new", draft());
    expect(readDraft(PROJECT_ID, "new", NOW + DRAFT_TTL_MS - 1000)).not.toBeNull();
    expect(readDraft(PROJECT_ID, "new", NOW + DRAFT_TTL_MS + 1000)).toBeNull();
    expect(localStorage.getItem(draftKey(PROJECT_ID, "new"))).toBeNull();
  });

  it.each([
    ["JSON invalide", "{pas du json"],
    ["tableau", "[]"],
    ["null", "null"],
    ["sans valeurs", JSON.stringify({ savedAt: new Date(NOW).toISOString() })],
    ["date illisible", JSON.stringify({ ...draft(), savedAt: "hier" })],
    ["valeurs de mauvais type", JSON.stringify({ ...draft(), values: "x" })],
  ])("contenu corrompu (%s) : ignoré sans lever, et supprimé", (_name, raw) => {
    localStorage.setItem(draftKey(PROJECT_ID, "new"), raw);
    expect(readDraft(PROJECT_ID, "new", NOW)).toBeNull();
    expect(localStorage.getItem(draftKey(PROJECT_ID, "new"))).toBeNull();
  });

  it("clearDraft supprime la clé et ignore une clé absente", () => {
    saveDraft(PROJECT_ID, "new", draft());
    clearDraft(PROJECT_ID, "new");
    expect(localStorage.getItem(draftKey(PROJECT_ID, "new"))).toBeNull();
    expect(() => clearDraft(PROJECT_ID, "new")).not.toThrow();
  });

  it("stockage indisponible (getItem, setItem, removeItem lèvent) : aucune exception, résultat neutre", () => {
    const boom = () => {
      throw new DOMException("denied", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(boom);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(boom);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(boom);
    expect(saveDraft(PROJECT_ID, "new", draft())).toBe(false);
    expect(readDraft(PROJECT_ID, "new", NOW)).toBeNull();
    expect(() => clearDraft(PROJECT_ID, "new")).not.toThrow();
    expect(savePending(PROJECT_ID, pending())).toBe(false);
    expect(readPending(PROJECT_ID, NOW)).toBeNull();
    expect(() => clearPending(PROJECT_ID)).not.toThrow();
    expect(() => clearAllFeatureStorage()).not.toThrow();
  });

  it("quota dépassé : false, sans exception", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(saveDraft(PROJECT_ID, "new", draft())).toBe(false);
  });
});

describe("marqueur de suivi", () => {
  it("écrit puis relit { batchId, kind, specId, title, savedAt }", () => {
    expect(savePending(PROJECT_ID, pending())).toBe(true);
    expect(readPending(PROJECT_ID, NOW + 1000)).toEqual(pending());
  });

  it("périmé après 24 h : absent et supprimé", () => {
    savePending(PROJECT_ID, pending());
    expect(readPending(PROJECT_ID, NOW + PENDING_TTL_MS - 1000)).not.toBeNull();
    expect(readPending(PROJECT_ID, NOW + PENDING_TTL_MS + 1000)).toBeNull();
    expect(localStorage.getItem(pendingKey(PROJECT_ID))).toBeNull();
  });

  it.each(["{x", "[]", JSON.stringify({ title: "sans lot" })])(
    "contenu corrompu %j : ignoré et supprimé",
    (raw) => {
      localStorage.setItem(pendingKey(PROJECT_ID), raw);
      expect(readPending(PROJECT_ID, NOW)).toBeNull();
      expect(localStorage.getItem(pendingKey(PROJECT_ID))).toBeNull();
    },
  );

  it("clearPending supprime le marqueur du projet seulement", () => {
    savePending(PROJECT_ID, pending());
    savePending(OTHER_PROJECT_ID, pending());
    clearPending(PROJECT_ID);
    expect(readPending(PROJECT_ID, NOW)).toBeNull();
    expect(readPending(OTHER_PROJECT_ID, NOW)).not.toBeNull();
  });
});

describe("clearAllFeatureStorage (déconnexion)", () => {
  it("efface tous les brouillons et marqueurs de suivi, et rien d'autre", () => {
    saveDraft(PROJECT_ID, "new", draft());
    saveDraft(PROJECT_ID, "F-001", draft());
    saveDraft(OTHER_PROJECT_ID, "new", draft());
    savePending(PROJECT_ID, pending());
    localStorage.setItem("koklo:theme", "dark");
    localStorage.setItem("autre-application", "x");
    clearAllFeatureStorage();
    expect(Object.keys(localStorage).sort()).toEqual(["autre-application", "koklo:theme"]);
  });
});
