// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContextBanner, LabeledNote } from "../src/index.ts";

/** TK-117 lot C : bandeaux Données et Résumé (maquette 15 l.160, 206). */
describe("ContextBanner", () => {
  it("note bordée sur --surface avec icône, texte et actions", () => {
    render(
      <ContextBanner icon="location_on" actions={<button type="button">Classer</button>}>
        Hébergement : Paris
      </ContextBanner>,
    );
    const banner = screen.getByRole("note");
    expect(banner).toHaveTextContent("Hébergement : Paris");
    expect(banner.className).toContain("bg-surface");
    expect(banner.className).toContain("rounded-[10px]");
    expect(screen.getByRole("button", { name: "Classer" })).toBeInTheDocument();
  });
});

describe("variantes de la fiche d'une menace", () => {
  it("cadre sans fond à texte muet, et texte à intitulé sur --surface", () => {
    render(
      <>
        <ContextBanner icon="verified" variant="outline">
          Scénario d'abus.
        </ContextBanner>
        <LabeledNote label="Ce qui peut arriver">Un export.</LabeledNote>
      </>,
    );
    expect(screen.getByRole("note").className).not.toContain("bg-surface");
    expect(screen.getByRole("note").className).toContain("text-muted-foreground");
    expect(screen.getByText("Un export.").parentElement?.className).toContain("bg-surface");
  });
});
