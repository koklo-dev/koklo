// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SummaryCard, SummaryGrid } from "../src/index.ts";

/** TK-117 lot C : cartes du résumé client (maquette 15 l.208-209). */
describe("SummaryCard", () => {
  it("article titré, tuile à icône, la dernière sur toute la largeur", () => {
    render(
      <SummaryGrid>
        <SummaryCard icon="lock" title="Ce qui est protégé">
          Chiffré.
        </SummaryCard>
        <SummaryCard icon="campaign" title="En cas d'incident" wide>
          24 heures.
        </SummaryCard>
      </SummaryGrid>,
    );
    const [first, last] = screen.getAllByRole("article");
    expect(first).toHaveTextContent("Chiffré.");
    expect(
      screen.getByRole("heading", { level: 2, name: "En cas d'incident" }),
    ).toBeInTheDocument();
    expect(first?.className).not.toContain("col-span-full");
    expect(last?.className).toContain("col-span-full");
  });
});
