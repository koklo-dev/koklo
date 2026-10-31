// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import * as ui from "../src/index.ts";
import { uiRoot } from "./helpers/paths.ts";

/** TK-48 / 48e : composant `Textarea` (équivalent shadcn, mêmes tokens que `Input`). */
const { Textarea } = ui;

function Controlled() {
  const [value, setValue] = useState("");
  return <Textarea aria-label="Note" value={value} onChange={(e) => setValue(e.target.value)} />;
}

describe("Textarea", () => {
  it("est exporté par le point d'entrée unique de @koklo/ui", () => {
    expect(typeof Textarea).toBe("function");
  });

  it("rend un vrai <textarea> avec data-slot, nommé par son label", () => {
    render(
      <>
        <label htmlFor="d">Description</label>
        <Textarea id="d" />
      </>,
    );
    const field = screen.getByRole("textbox", { name: "Description" });
    expect(field.tagName).toBe("TEXTAREA");
    expect(field).toHaveAttribute("data-slot", "textarea");
  });

  it("transmet les attributs natifs (rows, placeholder, readOnly, aria-*)", () => {
    render(
      <Textarea
        aria-label="Note"
        rows={5}
        placeholder="Texte"
        readOnly
        aria-invalid="true"
        aria-describedby="aide"
      />,
    );
    const field = screen.getByRole("textbox", { name: "Note" });
    expect(field).toHaveAttribute("rows", "5");
    expect(field).toHaveAttribute("placeholder", "Texte");
    expect(field).toHaveAttribute("readonly");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAttribute("aria-describedby", "aide");
  });
});

describe("Textarea, styles", () => {
  it("fusionne className avec les classes de base sans les perdre", () => {
    render(<Textarea aria-label="Note" className="h-40" />);
    const field = screen.getByRole("textbox", { name: "Note" });
    expect(field).toHaveClass("h-40");
    expect(field.className).toMatch(/border-input/);
    expect(field.className).toMatch(/rounded-md/);
  });

  it("style l'état invalide avec le token destructive (jamais une couleur brute)", () => {
    render(<Textarea aria-label="Note" />);
    const { className } = screen.getByRole("textbox", { name: "Note" });
    expect(className).toMatch(/aria-invalid:border-destructive/);
    expect(className).toMatch(/focus-visible:ring-/);
  });

  it("garde le texte saisi, y compris les retours à la ligne", async () => {
    render(<Controlled />);
    await userEvent.type(screen.getByRole("textbox", { name: "Note" }), "a{Enter}b");
    expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue("a\nb");
  });

  it("le fichier source n'embarque aucune couleur en dur", () => {
    const source = readFileSync(`${uiRoot}/src/components/textarea.tsx`, "utf8");
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(|oklch\(/);
    expect(source).not.toMatch(
      /\b(?:bg|text|border|ring)-(?:red|blue|green|gray|slate|white|black)\b/,
    );
  });
});
