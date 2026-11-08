// @vitest-environment jsdom
import { Editor } from "@tiptap/react";
import { describe, expect, it } from "vitest";
import { ideaExtensions } from "../src/lib/idea-editor-extensions.ts";
import { serializeIdeaMarkdown } from "../src/lib/idea-markdown.ts";
import { filterSlash, slashContext } from "../src/lib/idea-slash.ts";

const make = (content: string) => new Editor({ extensions: ideaExtensions(), content });

describe("menu « / » minimal", () => {
  it("filtre sans accent ni casse", () => {
    expect(filterSlash("TITRE").map((c) => c.id)).toEqual(["h2", "h3"]);
    expect(filterSlash("encad").map((c) => c.id)).toEqual(["aside"]);
    expect(filterSlash("").length).toBe(10);
  });

  it("détecte « / » en fin de paragraphe", () => {
    const editor = make("<p>/ta</p>");
    editor.commands.focus("end");
    expect(slashContext(editor)).toMatchObject({ query: "ta" });
  });

  it("ignore un texte ordinaire", () => {
    const editor = make("<p>bonjour /</p>");
    editor.commands.focus("end");
    expect(slashContext(editor)).toBeNull();
  });

  it("exécute une commande sur le paragraphe vidé", () => {
    const editor = make("<p>/</p>");
    editor.commands.focus("end");
    editor.commands.deleteRange({ from: 1, to: 2 });
    filterSlash("titre 2")[0]?.run(editor);
    expect(editor.getHTML()).toContain("<h2>");
  });

  it("l'encadré s'écrit comme un encadré du Markdown", () => {
    const editor = make("<p></p>");
    filterSlash("encadré")[0]?.run(editor);
    expect(serializeIdeaMarkdown(editor)).toContain("> [!note]");
  });
});
