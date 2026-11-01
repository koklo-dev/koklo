import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginFeatureSession,
  clearAllFeatureStorage,
  draftKey,
  endFeatureSession,
  type FeatureDraft,
  pendingKey,
  readDraft,
  readPending,
  type StorageScope,
  saveDraft,
  savePending,
} from "../src/lib/feature-draft.ts";
import { EMPTY_VALUES } from "../src/lib/feature-form.ts";
import { PROJECT_ID, SCOPE, SHA } from "./support/features.tsx";

/**
 * TK-48 / 48e, revue indépendante : le brouillon et le marqueur appartiennent à un compte et à une organisation
 * (poste partagé), et ce qui est relu dans `localStorage` est validé champ par champ.
 */
const NOW = Date.parse("2026-10-31T12:00:00.000Z");
const savedAt = new Date(NOW).toISOString();
const OTHER_USER: StorageScope = { ...SCOPE, userId: "u2" };
const OTHER_ORG: StorageScope = {
  ...SCOPE,
  organizationId: "01900000-0000-7000-8000-0000000000a2",
};
const draft = (over: Partial<FeatureDraft> = {}): FeatureDraft => ({
  values: { ...EMPTY_VALUES, title: "Brouillon" },
  baseline: null,
  baseCommitSha: null,
  idempotencyKey: null,
  savedAt,
  ...over,
});
const pending = (over: Record<string, unknown> = {}) => ({
  batchId: "01900000-0000-7000-8000-0000000000d1",
  kind: "create" as const,
  specId: "F-004",
  title: "Nouvelle",
  savedAt,
  ...over,
});
const feature = (key: string) => Object.keys(localStorage).filter((k) => k.startsWith(key));
const DRAFT_KEY = draftKey(PROJECT_ID, "new");
const PENDING_KEY = pendingKey(PROJECT_ID);
/** Écrit un brouillon valide du compte courant, modifié par `change`, tel quel dans le stockage. */
const stored = (
  key: string,
  base: object,
  change: (o: Record<string, unknown>) => void = () => {},
) => {
  const o = { ...base, ownerId: SCOPE.userId, organizationId: SCOPE.organizationId } as Record<
    string,
    unknown
  >;
  change(o);
  localStorage.setItem(key, JSON.stringify(o));
};

beforeEach(() => {
  localStorage.clear();
  beginFeatureSession(SCOPE);
});
afterEach(() => vi.restoreAllMocks());

describe("cloisonnement par compte et par organisation", () => {
  it("le même compte et la même organisation relisent leur brouillon et leur marqueur", () => {
    saveDraft(SCOPE, PROJECT_ID, "new", draft());
    savePending(SCOPE, PROJECT_ID, pending());
    expect(readDraft(SCOPE, PROJECT_ID, "new", NOW)).toEqual(draft());
    expect(readPending(SCOPE, PROJECT_ID, NOW)).toEqual(pending());
  });

  it.each([
    ["un autre utilisateur", OTHER_USER],
    ["une autre organisation", OTHER_ORG],
  ])("%s : brouillon refusé et supprimé", (_name, scope) => {
    saveDraft(SCOPE, PROJECT_ID, "new", draft());
    expect(readDraft(scope, PROJECT_ID, "new", NOW)).toBeNull();
    expect(feature("koklo:feature-")).toEqual([]);
    expect(readDraft(SCOPE, PROJECT_ID, "new", NOW)).toBeNull();
  });

  it.each([
    ["un autre utilisateur", OTHER_USER],
    ["une autre organisation", OTHER_ORG],
  ])("%s : marqueur refusé et supprimé", (_name, scope) => {
    savePending(SCOPE, PROJECT_ID, pending());
    expect(readPending(scope, PROJECT_ID, NOW)).toBeNull();
    expect(feature("koklo:feature-")).toEqual([]);
  });

  it("sans session connue (scope null) : rien n'est lu ni écrit", () => {
    expect(saveDraft(null, PROJECT_ID, "new", draft())).toBe(false);
    expect(savePending(null, PROJECT_ID, pending())).toBe(false);
    saveDraft(SCOPE, PROJECT_ID, "new", draft());
    expect(readDraft(null, PROJECT_ID, "new", NOW)).toBeNull();
    expect(feature("koklo:feature-")).toHaveLength(1);
  });

  it("un contenu ancien sans propriétaire est refusé et supprimé", () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft()));
    expect(readDraft(SCOPE, PROJECT_ID, "new", NOW)).toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("beginFeatureSession : efface ce qui appartient à un autre compte ou à une autre organisation, garde le reste", () => {
    saveDraft(SCOPE, PROJECT_ID, "new", draft());
    saveDraft(OTHER_USER, PROJECT_ID, "F-001", draft());
    savePending(OTHER_ORG, PROJECT_ID, pending());
    localStorage.setItem("koklo:theme", "dark");
    beginFeatureSession(SCOPE);
    expect(Object.keys(localStorage).sort()).toEqual([DRAFT_KEY, "koklo:theme"]);
  });

  it("beginFeatureSession : un contenu illisible est effacé aussi", () => {
    localStorage.setItem(PENDING_KEY, "{pas du json");
    beginFeatureSession(SCOPE);
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
  });
});

describe("fin de session", () => {
  it("endFeatureSession efface tout et plus rien n'est écrit (le démontage d'un formulaire ne réécrit pas)", () => {
    saveDraft(SCOPE, PROJECT_ID, "new", draft());
    savePending(SCOPE, PROJECT_ID, pending());
    endFeatureSession();
    expect(feature("koklo:feature-")).toEqual([]);
    expect(saveDraft(SCOPE, PROJECT_ID, "new", draft())).toBe(false);
    expect(savePending(SCOPE, PROJECT_ID, pending())).toBe(false);
    expect(feature("koklo:feature-")).toEqual([]);
  });

  it("la session suivante réautorise l'écriture", () => {
    endFeatureSession();
    beginFeatureSession(OTHER_USER);
    expect(saveDraft(OTHER_USER, PROJECT_ID, "new", draft())).toBe(true);
  });

  it("clearAllFeatureStorage seul n'interdit pas l'écriture", () => {
    clearAllFeatureStorage();
    expect(saveDraft(SCOPE, PROJECT_ID, "new", draft())).toBe(true);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: un cas par champ du schéma de validation
describe("validation stricte du brouillon relu", () => {
  const goodCriterion = {
    id: "AC-1",
    title: "Un critère",
    steps: [{ type: "quand" as const, text: "x" }],
  };

  it("accepte un brouillon complet (critères, liens, version, clé)", () => {
    const value = draft({
      values: {
        ...EMPTY_VALUES,
        title: "T",
        priority: "must",
        status: "specifiee",
        criteria: [goodCriterion, { key: "k1", title: "Neuf", steps: [] }],
        screens: "S-accueil",
      },
      baseline: { ...EMPTY_VALUES, title: "Avant" },
      baseCommitSha: SHA,
      idempotencyKey: "feature-abc",
    });
    saveDraft(SCOPE, PROJECT_ID, "F-001", value);
    expect(readDraft(SCOPE, PROJECT_ID, "F-001", NOW)).toEqual(value);
  });

  const values = (over: Record<string, unknown>) => ({ ...EMPTY_VALUES, ...over });
  it.each([
    ["titre numérique", (o: Record<string, unknown>) => (o.values = values({ title: 42 }))],
    [
      "critères non tableau",
      (o: Record<string, unknown>) => (o.values = values({ criteria: "x" })),
    ],
    ["statut inconnu", (o: Record<string, unknown>) => (o.values = values({ status: "archive" }))],
    [
      "priorité inconnue",
      (o: Record<string, unknown>) => (o.values = values({ priority: "urgent" })),
    ],
    [
      "description absente",
      (o: Record<string, unknown>) =>
        (o.values = { title: "T", priority: "", status: "brouillon" }),
    ],
    [
      "critère sans titre",
      (o: Record<string, unknown>) => (o.values = values({ criteria: [{ steps: [] }] })),
    ],
    [
      "étapes non tableau",
      (o: Record<string, unknown>) =>
        (o.values = values({ criteria: [{ title: "x", steps: {} }] })),
    ],
    [
      "type d'étape inconnu",
      (o: Record<string, unknown>) =>
        (o.values = values({ criteria: [{ title: "x", steps: [{ type: "puis", text: "t" }] }] })),
    ],
    [
      "texte d'étape numérique",
      (o: Record<string, unknown>) =>
        (o.values = values({ criteria: [{ title: "x", steps: [{ type: "et", text: 1 }] }] })),
    ],
    [
      "identifiant de critère invalide",
      (o: Record<string, unknown>) =>
        (o.values = values({ criteria: [{ id: "X-1", title: "x", steps: [] }] })),
    ],
    [
      "liste de liens non texte",
      (o: Record<string, unknown>) => (o.values = values({ screens: ["S-a"] })),
    ],
    ["référence invalide", (o: Record<string, unknown>) => (o.baseline = { title: 1 })],
    ["version non texte", (o: Record<string, unknown>) => (o.baseCommitSha = 12)],
    ["version non hexadécimale", (o: Record<string, unknown>) => (o.baseCommitSha = "pas-un-sha")],
    ["clé d'idempotence non texte", (o: Record<string, unknown>) => (o.idempotencyKey = {})],
    ["clé d'idempotence absente", (o: Record<string, unknown>) => delete o.idempotencyKey],
    ["version absente (ancien schéma)", (o: Record<string, unknown>) => delete o.baseCommitSha],
    ["date non texte", (o: Record<string, unknown>) => (o.savedAt = 12)],
  ])("brouillon altéré (%s) : ignoré et supprimé, sans lever", (_name, change) => {
    stored(DRAFT_KEY, draft(), change);
    expect(readDraft(SCOPE, PROJECT_ID, "new", NOW)).toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it.each([["{pas du json"], ["[]"], ["null"], ['"texte"'], ["12"]])(
    "JSON %s : ignoré et supprimé",
    (raw) => {
      localStorage.setItem(DRAFT_KEY, raw);
      expect(readDraft(SCOPE, PROJECT_ID, "new", NOW)).toBeNull();
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    },
  );
});

describe("validation stricte du marqueur relu", () => {
  it("accepte kind update avec un F-nnn", () => {
    savePending(SCOPE, PROJECT_ID, pending({ kind: "update", specId: "F-0123" }));
    expect(readPending(SCOPE, PROJECT_ID, NOW)).toMatchObject({ kind: "update", specId: "F-0123" });
  });

  it("accepte l'absence de specId", () => {
    const { specId: _omit, ...rest } = pending();
    savePending(SCOPE, PROJECT_ID, rest as ReturnType<typeof pending>);
    expect(readPending(SCOPE, PROJECT_ID, NOW)).not.toBeNull();
  });

  it.each([
    ["lot absent", (o: Record<string, unknown>) => delete o.batchId],
    ["lot vide", (o: Record<string, unknown>) => (o.batchId = "")],
    ["lot numérique", (o: Record<string, unknown>) => (o.batchId = 7)],
    ["genre inconnu", (o: Record<string, unknown>) => (o.kind = "delete")],
    ["genre absent", (o: Record<string, unknown>) => delete o.kind],
    ["specId invalide", (o: Record<string, unknown>) => (o.specId = "F-1")],
    ["specId numérique", (o: Record<string, unknown>) => (o.specId = 4)],
    ["titre numérique", (o: Record<string, unknown>) => (o.title = 4)],
    ["date illisible", (o: Record<string, unknown>) => (o.savedAt = "hier")],
  ])("marqueur altéré (%s) : ignoré et supprimé, sans lever", (_name, change) => {
    stored(PENDING_KEY, pending(), change);
    expect(readPending(SCOPE, PROJECT_ID, NOW)).toBeNull();
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
  });
});
