import { describe, expect, it } from "vitest";
import { parseSpecFiles, rgpdRegistry, SecurityDataSchema, securityContext } from "../src/index.ts";
import { securityFiles } from "./security-helpers.ts";
import { STACK_PATH, STACK_YAML } from "./technical-helpers.ts";

/** TK-117 lot A (cas 6, B809) : registre des traitements en Markdown, contexte tiré du cahier technique. */
const data = SecurityDataSchema.parse({
  donnees: [
    {
      donnee: "Nom | <script>\\ [lien](x)",
      champs: ["user.nom"],
      categorie: "personnelle",
      acces: ["Gérante"],
    },
    {
      donnee: "E-mail",
      champs: ["user.email"],
      categorie: "contact",
      conservation: "3 ans",
      protection: "Chiffré\nmasqué",
    },
    { donnee: "Jeton", champs: ["user.jeton"], categorie: "secret" },
  ],
});

describe("registre RGPD", () => {
  const registry = rgpdRegistry({
    projectName: "Atelier Lumière",
    projectSlug: "atelier-lumiere",
    data,
    context: { hosting: ["Scaleway · Paris"], subprocessors: [], transfers: undefined },
  });

  it("nom de fichier sûr et mention de relecture juridique", () => {
    expect(registry.filename).toBe("registre-rgpd-atelier-lumiere.md");
    expect(registry.markdown).toContain("à faire relire par un juriste");
    expect(registry.markdown).toContain("# Registre des traitements · Atelier Lumière");
    const hostile = rgpdRegistry({
      projectName: "x",
      projectSlug: '../../Étoile "x"',
      data,
      context: { hosting: [], subprocessors: [], transfers: undefined },
    });
    expect(hostile.filename).toBe("registre-rgpd-etoile-x.md");
  });

  it("données personnelles, contact et sensibles seules, « À décider » sans durée", () => {
    expect(registry.markdown).toContain("| E-mail | user.email | Contact | 3 ans |");
    expect(registry.markdown).toMatch(/\| user\.nom \| Personnelle \| À décider \| Gérante \|/);
    expect(registry.markdown).not.toContain("Jeton");
  });

  it("échappe tout texte : aucune cellule ni balise injectée", () => {
    expect(registry.markdown).toContain("Nom \\| &lt;script&gt;\\\\ \\[lien\\](x)");
    expect(registry.markdown).toContain("Chiffré masqué");
    expect(registry.markdown).not.toContain("<script>");
  });

  it("hébergement du cahier technique ; ce qui manque est « À préciser », sans base légale inventée", () => {
    expect(registry.markdown).toContain("- Hébergement : Scaleway · Paris");
    expect(registry.markdown).toContain("- Sous-traitants : À préciser");
    expect(registry.markdown).toContain("- Transferts hors de l'Union européenne : À préciser");
    expect(registry.markdown).not.toMatch(/base légale/i);
  });

  it("aucune donnée personnelle : le tableau le dit", () => {
    const empty = rgpdRegistry({
      projectName: "x",
      projectSlug: "x",
      data: undefined,
      context: { hosting: [], subprocessors: [], transfers: undefined },
    });
    expect(empty.markdown).toContain("Aucune donnée personnelle classée.");
  });
});

describe("contexte d'hébergement", () => {
  it("environnements et services externes retenus du cahier ; transferts du fichier de données", () => {
    const chosen = STACK_YAML.replace("statut: a_trancher", "statut: choisi\nchoix: Brevo");
    const { spec } = parseSpecFiles(securityFiles({ [STACK_PATH]: chosen }));
    expect(
      securityContext({
        environments: spec.environments[0]?.value,
        stacks: spec.stacks.map((s) => s.value),
        data: spec.securityData[0]?.value,
      }),
    ).toEqual({
      hosting: ["Scaleway · Paris"],
      subprocessors: ["Brevo (Fournisseur SMS)"],
      transfers: "Aucun transfert hors de l'Union européenne.",
    });
  });

  it("rien d'inventé : un choix à trancher n'est pas un sous-traitant", () => {
    const { spec } = parseSpecFiles(securityFiles());
    const stacks = spec.stacks.map((s) => s.value);
    expect(securityContext({ stacks })).toEqual({
      hosting: [],
      subprocessors: [],
      transfers: undefined,
    });
  });
});
