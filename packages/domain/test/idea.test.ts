import { describe, expect, it } from "vitest";
import {
  countOpenQuestions,
  framingMissingLabel,
  framingReadiness,
  IDEA_CONTENT_MAX,
  IDEA_PAGE_LIMIT,
  IDEA_PRESENCE_TTL_MS,
  IDEA_SYNTHESIS_SLUG,
  IDEA_TRASH_DAYS,
  type IdeaPageStatus,
  InvalidIdeaError,
  ideaModifiedSince,
  ideaPageStatusAfterSave,
  ideaSlugOf,
  ideaVersionTag,
  isIdeaPresenceActive,
  isIdeaReorderComplete,
  isIdeaRestorable,
  isIdeaVersionTag,
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

describe("idea : étiquette de version idea-vN (TK-91)", () => {
  it("construit idea-v<entier> de 1 à 9999 et réserve le slug _synthese", () => {
    expect(IDEA_SYNTHESIS_SLUG).toBe("_synthese");
    expect(ideaVersionTag(1)).toBe("idea-v1");
    expect(ideaVersionTag(9999)).toBe("idea-v9999");
    // Un slug de page ne contient jamais `_` : la Synthèse ne peut pas être une page.
    expect(ideaSlugOf(IDEA_SYNTHESIS_SLUG)).not.toBe(IDEA_SYNTHESIS_SLUG);
  });

  it.each([0, -1, 10_000, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "refuse le numéro %s",
    (n) => {
      expect(() => ideaVersionTag(n)).toThrow(InvalidIdeaError);
    },
  );

  it("reconnaît seulement les étiquettes construites par le serveur", () => {
    expect(isIdeaVersionTag("idea-v1")).toBe(true);
    expect(isIdeaVersionTag("idea-v9999")).toBe(true);
    for (const bad of [
      "idea-v0",
      "idea-v01",
      "idea-v10000",
      "idea-v1\n",
      "v1",
      "idea-v1;x",
      "",
      3,
    ]) {
      expect(isIdeaVersionTag(bad), String(bad)).toBe(false);
    }
  });
});

describe("idea : seuil du passage au cadrage (TK-91, B258)", () => {
  const page = (title: string, required: boolean, status: IdeaPageStatus) => ({
    title,
    required,
    status,
  });

  it("3 pages requises stables sur 4 : il manque Périmètre", () => {
    const readiness = framingReadiness([
      page("Vision", true, "stable"),
      page("Problème", true, "stable"),
      page("Utilisateurs", true, "stable"),
      page("Périmètre", true, "draft"),
      page("Glossaire", false, "empty"),
    ]);
    expect(readiness).toEqual({ ready: false, stable: 3, total: 5, missing: ["Périmètre"] });
  });

  it("toutes les requises stables : prêt, même si les autres pages ne le sont pas", () => {
    const readiness = framingReadiness([
      page("Vision", true, "stable"),
      page("Mesure", false, "review"),
    ]);
    expect(readiness).toEqual({ ready: true, stable: 1, total: 2, missing: [] });
  });

  it("une page requise renommée garde son drapeau : le titre courant est dit", () => {
    const readiness = framingReadiness([
      page("Cible", true, "review"),
      page("Vision", true, "stable"),
    ]);
    expect(readiness.missing).toEqual(["Cible"]);
  });

  it("sans aucune page requise, le seuil est atteint (rien n'est exigé)", () => {
    expect(framingReadiness([]).ready).toBe(true);
  });

  it("le libellé nomme les pages manquantes, accordé au nombre", () => {
    expect(framingMissingLabel(["Périmètre"])).toBe("Périmètre stable");
    expect(framingMissingLabel(["Utilisateurs", "Périmètre"])).toBe(
      "Utilisateurs et Périmètre stables",
    );
    expect(framingMissingLabel(["Vision", "Utilisateurs", "Périmètre"])).toBe(
      "Vision, Utilisateurs et Périmètre stables",
    );
  });
});

describe("idea : questions ouvertes (TK-91, B258)", () => {
  it("compte les tâches non cochées, pas les cochées ni les puces simples", () => {
    const md = [
      "# Hypothèses",
      "- [ ] Le client paiera-t-il ?",
      "- [x] Le marché existe",
      "- [X] Cible validée",
      "* [ ] Autre question",
      "  - [ ] Question imbriquée",
      "- simple puce",
      "- [] sans espace",
      "- [ ]sans séparation",
    ].join("\n");
    expect(countOpenQuestions(md)).toBe(3);
  });

  it("ignore les tâches dans un bloc de code et compte une tâche vide", () => {
    const md = "```\n- [ ] exemple\n```\n- [ ]\n";
    expect(countOpenQuestions(md)).toBe(1);
  });

  it("une page vide n'a aucune question ouverte", () => {
    expect(countOpenQuestions("")).toBe(0);
  });
});

describe("idea : modifié depuis la version figée (TK-91, B259)", () => {
  const frozen = { vision: 2, probleme: 1 };

  it("faux si les pages et leurs versions sont identiques", () => {
    expect(ideaModifiedSince(frozen, { probleme: 1, vision: 2 })).toBe(false);
  });

  it("vrai si une version de page a changé, si une page s'ajoute ou disparaît", () => {
    expect(ideaModifiedSince(frozen, { vision: 3, probleme: 1 })).toBe(true);
    expect(ideaModifiedSince(frozen, { vision: 2, probleme: 1, mesure: 1 })).toBe(true);
    expect(ideaModifiedSince(frozen, { vision: 2 })).toBe(true);
  });

  it("une empreinte vide contre un dossier vide : pas de modification", () => {
    expect(ideaModifiedSince({}, {})).toBe(false);
  });
});
