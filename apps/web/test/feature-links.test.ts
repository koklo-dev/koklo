import { describe, expect, it } from "vitest";
import { EMPTY_VALUES } from "../src/lib/feature-form.ts";
import { fieldOfTag, linkTags, patchForTags, validateTag } from "../src/lib/feature-links.ts";
import { prefillPatch } from "../src/lib/feature-prefill.ts";

/** TK-101 lot B, cas 2 (fiche §3) : « Liens » à puces répartis par préfixe (B329 e). */
describe("répartition des liens par préfixe", () => {
  it.each([
    ["S-accueil", "screens"],
    ["RL-admin", "roles"],
    ["R-001", "rules"],
    ["T-client", "tables"],
    ["E-connexion", "endpoints"],
    ["NFR-perf", "nfr"],
  ] as const)("%s va dans %s", (tag, field) => {
    expect(fieldOfTag(tag)).toBe(field);
    expect(patchForTags(EMPTY_VALUES, [tag])).toEqual({ [field]: tag });
  });

  it("RL- n'est pas pris pour R- et NFR- n'est pas pris pour un autre préfixe", () => {
    expect(fieldOfTag("RL-admin")).toBe("roles");
    expect(fieldOfTag("NFR-x")).toBe("nfr");
  });

  it("préfixe inconnu (F-, P-) refusé avec un message qui liste les préfixes", () => {
    for (const tag of ["F-003", "P-reserver", "X-1"]) {
      expect(fieldOfTag(tag)).toBeNull();
      expect(validateTag(tag)).toMatch(/n'est pas un lien d'une fonctionnalité.*S- \(écran\)/);
    }
  });

  it("identifiant mal formé pour son préfixe refusé avec un exemple", () => {
    expect(validateTag("R-1")).toBe("« R-1 » n'est pas un identifiant valide (exemple : R-001).");
    expect(validateTag("R-001")).toBeNull();
  });

  it("retirer une puce l'ôte de sa liste et laisse les autres", () => {
    const values = { ...EMPTY_VALUES, screens: "S-a\nS-b", rules: "R-001" };
    expect(linkTags(values)).toEqual(["S-a", "S-b", "R-001"]);
    expect(patchForTags(values, ["S-a", "R-001"])).toEqual({ screens: "S-a" });
  });
});

describe("préremplissage : champs vides seulement (B329 h)", () => {
  const proposed = {
    title: "Liste d'attente",
    priority: "should" as const,
    description: "Quand aucun créneau est libre.",
    links: ["R-001", "F-003", "P-reserver", "S-attente"],
  };

  it("remplit tout ce qui est vide, ignore les liens F- et P-, marque les champs remplis", () => {
    const { values, keys } = prefillPatch(EMPTY_VALUES, proposed);
    expect(values).toMatchObject({
      title: "Liste d'attente",
      priority: "should",
      description: "Quand aucun créneau est libre.",
      rules: "R-001",
      screens: "S-attente",
    });
    expect(keys).toEqual(["title", "priority", "description", "links"]);
  });

  it("ne touche pas un champ déjà saisi et ne le marque pas", () => {
    const { values, keys } = prefillPatch(
      { ...EMPTY_VALUES, title: "Mon titre", rules: "R-009" },
      proposed,
    );
    expect(values.title).toBeUndefined();
    expect(values.rules).toBeUndefined();
    expect(keys).toEqual(["priority", "description"]);
  });
});
