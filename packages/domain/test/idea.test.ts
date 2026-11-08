import { describe, expect, it } from "vitest";
import {
  IDEA_CONTENT_MAX,
  IDEA_PAGE_LIMIT,
  IDEA_PRESENCE_TTL_MS,
  IDEA_TRASH_DAYS,
  InvalidIdeaError,
  ideaPageStatusAfterSave,
  ideaSlugOf,
  isIdeaPresenceActive,
  isIdeaReorderComplete,
  isIdeaRestorable,
  normalizeIdeaContent,
  normalizeIdeaTitle,
  uniqueIdeaSlug,
} from "../src/index.ts";

describe("idea : constantes de la décision 3, 4, 5", () => {
  it("fige les bornes du lot", () => {
    expect(IDEA_PAGE_LIMIT).toBe(50);
    expect(IDEA_TRASH_DAYS).toBe(30);
    expect(IDEA_CONTENT_MAX).toBe(50_000);
    expect(IDEA_PRESENCE_TTL_MS).toBe(45_000);
  });
});

describe("ideaSlugOf", () => {
  it("minuscules, sans accents, [a-z0-9-], 40 caractères, repli page", () => {
    expect(ideaSlugOf("Été à Noël !")).toBe("ete-a-noel");
    expect(ideaSlugOf("Périmètre")).toBe("perimetre");
    expect(ideaSlugOf("x".repeat(80))).toHaveLength(40);
    expect(ideaSlugOf("!!!")).toBe("page");
    expect(ideaSlugOf("")).toBe("page");
  });
  it("ne garde pas de tiret final après la coupe", () => {
    expect(ideaSlugOf(`${"a".repeat(39)} b`)).toBe("a".repeat(39));
  });
});

describe("uniqueIdeaSlug", () => {
  it("rend le slug tel quel s'il est libre, sinon suffixe -2, -3", () => {
    expect(uniqueIdeaSlug("vision", [])).toBe("vision");
    expect(uniqueIdeaSlug("vision", ["vision"])).toBe("vision-2");
    expect(uniqueIdeaSlug("vision", ["vision", "vision-2"])).toBe("vision-3");
  });
  it("reste dans 40 caractères avec le suffixe", () => {
    const base = "a".repeat(40);
    const slug = uniqueIdeaSlug(base, [base]);
    expect(slug).toHaveLength(40);
    expect(slug.endsWith("-2")).toBe(true);
    expect(slug).toMatch(/^[a-z0-9-]{1,40}$/);
  });
});

describe("normalizeIdeaTitle", () => {
  it("trim, une ligne, 1 à 120 caractères", () => {
    expect(normalizeIdeaTitle("  Vision  ")).toBe("Vision");
    expect(() => normalizeIdeaTitle("   ")).toThrow(InvalidIdeaError);
    expect(() => normalizeIdeaTitle("a".repeat(121))).toThrow(InvalidIdeaError);
    expect(normalizeIdeaTitle("a".repeat(120))).toHaveLength(120);
  });
  it("refuse saut de ligne et caractères de contrôle", () => {
    expect(() => normalizeIdeaTitle("a\nb")).toThrow(InvalidIdeaError);
    expect(() => normalizeIdeaTitle("a\u0000b")).toThrow(InvalidIdeaError);
    expect(() => normalizeIdeaTitle("a\tb")).toThrow(InvalidIdeaError);
  });
});

describe("normalizeIdeaContent", () => {
  it("accepte le Markdown multi-ligne, refuse NUL et plus de 50 000 caractères", () => {
    expect(normalizeIdeaContent("# a\n\nb\tc")).toBe("# a\n\nb\tc");
    expect(() => normalizeIdeaContent("a\u0000b")).toThrow(InvalidIdeaError);
    expect(() => normalizeIdeaContent("a".repeat(50_001))).toThrow(InvalidIdeaError);
    expect(normalizeIdeaContent("a".repeat(50_000))).toHaveLength(50_000);
  });
  it("refuse un substitut UTF-16 isolé", () => {
    expect(() => normalizeIdeaContent("a\ud800b")).toThrow(InvalidIdeaError);
  });
});

describe("ideaPageStatusAfterSave", () => {
  it("un contenu vide rend la page vide, un contenu sur une page vide la passe en brouillon", () => {
    expect(ideaPageStatusAfterSave("draft", "   \n")).toBe("empty");
    expect(ideaPageStatusAfterSave("stable", "")).toBe("empty");
    expect(ideaPageStatusAfterSave("empty", "texte")).toBe("draft");
  });
  it("garde le statut courant sinon", () => {
    expect(ideaPageStatusAfterSave("review", "texte")).toBe("review");
    expect(ideaPageStatusAfterSave("stable", "texte")).toBe("stable");
  });
});

describe("isIdeaRestorable", () => {
  const now = new Date("2026-11-08T12:00:00Z");
  it("restaurable jusqu'à 30 jours inclus, pas au-delà", () => {
    expect(isIdeaRestorable(new Date("2026-11-07T12:00:00Z"), now)).toBe(true);
    expect(isIdeaRestorable(new Date("2026-10-09T12:00:00Z"), now)).toBe(true);
    expect(isIdeaRestorable(new Date("2026-10-09T11:59:59Z"), now)).toBe(false);
  });
});

describe("isIdeaReorderComplete", () => {
  it("exactement l'ensemble des pages actives, sans doublon ni inconnu", () => {
    expect(isIdeaReorderComplete(["a", "b", "c"], ["c", "a", "b"])).toBe(true);
    expect(isIdeaReorderComplete(["a", "b", "c"], ["a", "b"])).toBe(false);
    expect(isIdeaReorderComplete(["a", "b", "c"], ["a", "a", "b"])).toBe(false);
    expect(isIdeaReorderComplete(["a", "b"], ["a", "b", "x"])).toBe(false);
    expect(isIdeaReorderComplete(["a", "b"], ["a", "x"])).toBe(false);
  });
});

describe("isIdeaPresenceActive", () => {
  const now = new Date("2026-11-08T12:00:00Z");
  it("actif si vu depuis moins de 45 s", () => {
    expect(isIdeaPresenceActive(new Date("2026-11-08T11:59:30Z"), now)).toBe(true);
    expect(isIdeaPresenceActive(new Date("2026-11-08T11:59:14Z"), now)).toBe(false);
  });
});
