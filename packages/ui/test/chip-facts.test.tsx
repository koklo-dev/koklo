// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChipFacts } from "../src/index.ts";

/** TK-117 lot C : intitulé de 120 et puces (maquette 15 l.145-147). */
describe("ChipFacts", () => {
  it("liste de définitions : intitulé muet de 120, puces à la suite", () => {
    render(<ChipFacts facts={[{ label: "Touche", children: <span>clients</span> }]} />);
    const term = screen.getByText("Touche");
    expect(term.tagName).toBe("DT");
    expect(term.className).toContain("basis-[120px]");
    expect(screen.getByText("clients").closest("dd")).not.toBeNull();
  });
});
