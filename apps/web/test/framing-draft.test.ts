import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginFeatureSession,
  clearAllFeatureStorage,
  draftKey,
  endFeatureSession,
  pendingKey,
  type StorageScope,
  saveDraft,
} from "../src/lib/feature-draft.ts";
import { EMPTY_VALUES } from "../src/lib/feature-form.ts";
import {
  clearFramingDraft,
  FRAMING_DRAFT_PREFIX,
  framingDraftKey,
  readFramingDraft,
  saveFramingDraft,
} from "../src/lib/framing-draft.ts";
import type { FramingDraft } from "../src/lib/framing-types.ts";
import { OTHER_PROJECT_ID, PROJECT_ID, SCOPE } from "./support/features.tsx";
import { feature } from "./support/framing.tsx";

/**
 * TK-59 / 59a, brouillon local de cadrage (S-framing §5.3, §4.13) : clé `koklo:framing-draft:<projet>`,
 * cloisonné par compte ET organisation, schéma validé à la lecture, 7 jours, purgé à la fin de session
 * (extension de `endFeatureSession` / `beginFeatureSession` : l'oublier fuit entre comptes).
 */
const NOW = Date.parse("2026-11-02T12:00:00.000Z");
const savedAt = new Date(NOW).toISOString();
const DAY = 24 * 60 * 60 * 1000;
const OTHER_USER: StorageScope = { ...SCOPE, userId: "u2" };
const OTHER_ORG: StorageScope = {
  ...SCOPE,
  organizationId: "01900000-0000-7000-8000-0000000000a2",
};
const KEY = framingDraftKey(PROJECT_ID);

const proposal = (title: string, status: "to_review" | "accepted" | "rejected" = "to_review") => ({
  id: `p-${title}`,
  status,
  value: feature(title),
  original: feature(title),
  duplicateOf: null,
});
const draft = (over: Partial<FramingDraft> = {}): FramingDraft => ({
  mode: "idea",
  idea: "Une idée",
  clarifications: "Mobile d'abord",
  pastedBrief: "",
  brief: {
    title: "Titre",
    problem: "Problème",
    users: "Utilisateurs",
    expectedOutcome: "Résultat",
    constraints: "",
    openQuestions: "Q1",
  },
  answers: ["R1"],
  proposals: [
    proposal("Réserver", "accepted"),
    proposal("Annuler", "rejected"),
    proposal("Rappel"),
  ],
  savedAt,
  ...over,
});
const framingKeys = () =>
  Object.keys(localStorage).filter((k) => k.startsWith(FRAMING_DRAFT_PREFIX));

beforeEach(() => {
  localStorage.clear();
  beginFeatureSession(SCOPE);
});
afterEach(() => vi.restoreAllMocks());

describe("clé et contenu", () => {
  it("la clé est koklo:framing-draft:<projectId>", () => {
    expect(KEY).toBe(`koklo:framing-draft:${PROJECT_ID}`);
    expect(FRAMING_DRAFT_PREFIX).toBe("koklo:framing-draft:");
  });

  it("aller-retour : idée, précisions, brief édité, propositions avec statut et éditions", () => {
    const saved = draft();
    expect(saveFramingDraft(SCOPE, PROJECT_ID, saved)).toBe(true);
    expect(readFramingDraft(SCOPE, PROJECT_ID, NOW)).toStrictEqual(saved);
    expect(framingKeys()).toEqual([KEY]);
  });

  it("un brouillon par projet", () => {
    saveFramingDraft(SCOPE, PROJECT_ID, draft({ idea: "A" }));
    saveFramingDraft(SCOPE, OTHER_PROJECT_ID, draft({ idea: "B" }));
    expect(readFramingDraft(SCOPE, PROJECT_ID, NOW)?.idea).toBe("A");
    expect(readFramingDraft(SCOPE, OTHER_PROJECT_ID, NOW)?.idea).toBe("B");
  });

  it("aucune clé d'API ni jeton n'est écrit (le propriétaire est un identifiant, pas un secret)", () => {
    saveFramingDraft(SCOPE, PROJECT_ID, draft());
    expect(localStorage.getItem(KEY)).not.toMatch(/sk-ant|apiKey|token|secret/i);
  });

  it("clearFramingDraft supprime la clé", () => {
    saveFramingDraft(SCOPE, PROJECT_ID, draft());
    clearFramingDraft(PROJECT_ID);
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});

describe("cloisonnement par compte et par organisation", () => {
  it("un autre compte ne relit pas le brouillon, qui est supprimé", () => {
    saveFramingDraft(SCOPE, PROJECT_ID, draft());
    expect(readFramingDraft(OTHER_USER, PROJECT_ID, NOW)).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("une autre organisation du même compte non plus", () => {
    saveFramingDraft(SCOPE, PROJECT_ID, draft());
    expect(readFramingDraft(OTHER_ORG, PROJECT_ID, NOW)).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("sans propriétaire connu (session pas encore lue) : rien n'est lu ni écrit", () => {
    expect(saveFramingDraft(null, PROJECT_ID, draft())).toBe(false);
    expect(framingKeys()).toEqual([]);
    saveFramingDraft(SCOPE, PROJECT_ID, draft());
    expect(readFramingDraft(null, PROJECT_ID, NOW)).toBeNull();
  });

  it("beginFeatureSession pour un autre compte efface le brouillon de cadrage du précédent", () => {
    saveFramingDraft(SCOPE, PROJECT_ID, draft());
    beginFeatureSession(OTHER_USER);
    expect(framingKeys()).toEqual([]);
  });

  it("beginFeatureSession pour le même compte conserve le brouillon", () => {
    saveFramingDraft(SCOPE, PROJECT_ID, draft());
    beginFeatureSession(SCOPE);
    expect(framingKeys()).toEqual([KEY]);
  });
});

describe("purge à la fin de session (déconnexion, session expirée)", () => {
  it("endFeatureSession efface le brouillon de cadrage en plus des brouillons de fonctionnalité", () => {
    saveFramingDraft(SCOPE, PROJECT_ID, draft());
    saveDraft(SCOPE, PROJECT_ID, "new", {
      values: { ...EMPTY_VALUES, title: "x" },
      baseline: null,
      baseCommitSha: null,
      idempotencyKey: null,
      savedAt,
    });
    endFeatureSession();
    expect(framingKeys()).toEqual([]);
    expect(localStorage.getItem(draftKey(PROJECT_ID, "new"))).toBeNull();
    expect(localStorage.getItem(pendingKey(PROJECT_ID))).toBeNull();
  });

  it("après endFeatureSession plus rien n'est écrit (le démontage ne réécrit pas le brouillon)", () => {
    endFeatureSession();
    expect(saveFramingDraft(SCOPE, PROJECT_ID, draft())).toBe(false);
    expect(framingKeys()).toEqual([]);
  });

  it("clearAllFeatureStorage efface aussi les brouillons de cadrage de tous les projets", () => {
    saveFramingDraft(SCOPE, PROJECT_ID, draft());
    saveFramingDraft(SCOPE, OTHER_PROJECT_ID, draft());
    clearAllFeatureStorage();
    expect(framingKeys()).toEqual([]);
  });

  it("un autre stockage de l'appareil n'est pas touché", () => {
    localStorage.setItem("koklo:theme", "dark");
    saveFramingDraft(SCOPE, PROJECT_ID, draft());
    endFeatureSession();
    expect(localStorage.getItem("koklo:theme")).toBe("dark");
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("expiration et schéma à la lecture", () => {
  it("lisible à 6 jours 23 h, expiré et supprimé après 7 jours", () => {
    saveFramingDraft(SCOPE, PROJECT_ID, draft());
    expect(readFramingDraft(SCOPE, PROJECT_ID, NOW + 7 * DAY - 60_000)).not.toBeNull();
    expect(readFramingDraft(SCOPE, PROJECT_ID, NOW + 7 * DAY + 60_000)).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("JSON invalide : null et supprimé", () => {
    localStorage.setItem(KEY, "{pas du json");
    expect(readFramingDraft(SCOPE, PROJECT_ID, NOW)).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  const stored = (change: (o: Record<string, unknown>) => void) => {
    const o: Record<string, unknown> = {
      ...draft(),
      ownerId: SCOPE.userId,
      organizationId: SCOPE.organizationId,
    };
    change(o);
    localStorage.setItem(KEY, JSON.stringify(o));
  };

  it.each([
    [
      "mode inconnu",
      (o: Record<string, unknown>) => {
        o.mode = "autre";
      },
    ],
    [
      "idée non textuelle",
      (o: Record<string, unknown>) => {
        o.idea = 42;
      },
    ],
    [
      "propositions non tableau",
      (o: Record<string, unknown>) => {
        o.proposals = "x";
      },
    ],
    [
      "statut de proposition inconnu",
      (o: Record<string, unknown>) => {
        o.proposals = [{ ...proposal("A"), status: "validee" }];
      },
    ],
    [
      "proposition sans critère valide",
      (o: Record<string, unknown>) => {
        o.proposals = [{ ...proposal("A"), value: { ...feature("A"), criteria: "x" } }];
      },
    ],
    [
      "priorité hors du contrat",
      (o: Record<string, unknown>) => {
        o.proposals = [{ ...proposal("A"), value: { ...feature("A"), priority: "urgent" } }];
      },
    ],
    [
      "doublon qui n'est pas un identifiant F-nnn",
      (o: Record<string, unknown>) => {
        o.proposals = [{ ...proposal("A"), duplicateOf: "https://evil.example" }];
      },
    ],
    [
      "date absente",
      (o: Record<string, unknown>) => {
        o.savedAt = undefined;
      },
    ],
    [
      "date illisible",
      (o: Record<string, unknown>) => {
        o.savedAt = "hier";
      },
    ],
  ])("%s : supprimé à la lecture", (_name, change) => {
    stored(change);
    expect(readFramingDraft(SCOPE, PROJECT_ID, NOW)).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("des valeurs hostiles mais bien formées sont relues telles quelles (le rendu est en texte brut)", () => {
    const hostile = "[x][1]\n[1]: javascript:alert(1) <img src=x onerror=alert(1)> //evil.com";
    saveFramingDraft(SCOPE, PROJECT_ID, draft({ idea: hostile }));
    expect(readFramingDraft(SCOPE, PROJECT_ID, NOW)?.idea).toBe(hostile);
  });
});

describe("stockage indisponible", () => {
  it("ne lève jamais : écriture refusée, lecture impossible, suppression impossible", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("interdit", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("interdit", "SecurityError");
    });
    expect(saveFramingDraft(SCOPE, PROJECT_ID, draft())).toBe(false);
    expect(readFramingDraft(SCOPE, PROJECT_ID, NOW)).toBeNull();
    expect(() => clearFramingDraft(PROJECT_ID)).not.toThrow();
    expect(() => endFeatureSession()).not.toThrow();
  });
});
