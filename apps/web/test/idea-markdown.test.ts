// @vitest-environment jsdom
import { Editor } from "@tiptap/react";
import { describe, expect, it } from "vitest";
import { ideaExtensions } from "../src/lib/idea-editor-extensions.ts";
import { loadIdeaMarkdown, serializeIdeaMarkdown } from "../src/lib/idea-markdown.ts";

const TEMPLATE_TITLES = [
  "Vision",
  "Problème",
  "Utilisateurs",
  "Proposition de valeur",
  "Parcours",
  "Périmètre",
  "Contraintes",
  "Mesure",
  "Hypothèses et risques",
  "Glossaire",
];

const SAMPLE = [
  "Ce qui entre dans la première version du portail, et ce qui attend.",
  "",
  "### Première version",
  "",
  "- [x] Réserver un créneau en moins de deux minutes, sans compte",
  "- [x] Annuler ou déplacer sa réservation depuis le lien reçu",
  "- [ ] Agenda du personnel synchronisé avec les réservations",
  "",
  "### Plus tard",
  "",
  "- Programme de fidélité",
  "- Application mobile native",
  "",
  "1. Premier",
  "2. Second",
  "",
  "> Une citation **importante**.",
  "",
  "> [!note]",
  "> Un encadré à lire.",
  "",
  "---",
  "",
  "| Rôle   | Droit  |",
  "| ------ | ------ |",
  "| Client | Rédige |",
  "",
  "Un [lien](https://exemple.fr/page) et du *texte*.",
].join("\n");

function roundTrip(markdown: string): string {
  const editor = new Editor({ extensions: ideaExtensions(), content: "" });
  loadIdeaMarkdown(editor, markdown);
  const out = serializeIdeaMarkdown(editor);
  editor.destroy();
  return out;
}

function html(markdown: string): string {
  const editor = new Editor({ extensions: ideaExtensions(), content: "" });
  loadIdeaMarkdown(editor, markdown);
  const out = editor.getHTML();
  editor.destroy();
  return out;
}

describe("T1 aller-retour Markdown", () => {
  it.each(TEMPLATE_TITLES)(
    "page par défaut « %s » : vide reste vide, rédigée revient à l'identique",
    (title) => {
      expect(roundTrip("")).toBe("");
      const page = [
        `### ${title}`,
        "",
        `Ce que l'équipe et le client retiennent pour « ${title} », avec du **gras** et du *texte*.`,
        "",
        "- Premier point",
        "",
        "- [ ] Question ouverte",
        "",
        "> Décision à confirmer.",
      ].join("\n");
      expect(roundTrip(page)).toBe(page);
    },
  );

  it("la page exemple de la maquette revient à l'identique", () => {
    expect(roundTrip(SAMPLE)).toBe(SAMPLE);
  });

  it("un second tour ne change plus rien", () => {
    const once = roundTrip(SAMPLE);
    expect(roundTrip(once)).toBe(once);
  });
});

describe("T2 contenu hostile inerte", () => {
  const HOSTILE = [
    "<script>alert(1)</script>",
    "",
    "<img src=x onerror=alert(1)>",
    "",
    "[x](javascript:alert(1)) ![i](http://a.test/p.png) [d](data:text/html,x) [v](vbscript:x)",
    "",
    "<b onclick=alert(1)>brut</b> et [ok](https://a.test)",
  ].join("\n");

  it("aucune balise exécutable, aucune image", () => {
    const dom = document.createElement("div");
    dom.innerHTML = html(HOSTILE);
    expect(dom.querySelector("script, img, iframe, object, embed, style")).toBeNull();
    for (const element of dom.querySelectorAll("*")) {
      expect(element.getAttributeNames().filter((name) => name.startsWith("on"))).toEqual([]);
    }
  });

  it("les liens non http(s) sont du texte, les http(s) portent rel", () => {
    const dom = document.createElement("div");
    dom.innerHTML = html(HOSTILE);
    const links = [...dom.querySelectorAll("a")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["https://a.test"]);
    expect(links[0]?.getAttribute("rel")).toBe("noopener noreferrer nofollow");
    expect(dom.textContent).toContain("i d v");
  });

  it("le Markdown réécrit ne contient plus de lien dangereux", () => {
    const out = roundTrip(HOSTILE);
    expect(out).not.toMatch(/javascript:|vbscript:|data:text|<script|<img|onerror/i);
  });
});
