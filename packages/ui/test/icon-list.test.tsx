// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IconList } from "../src/index.ts";

/** TK-117 lot C : liste à icône (parades, règles de propriété, blocages, maquette 15 l.144, 181, 199). */
describe("IconList", () => {
  it.each([
    ["shield", "text-primary"],
    ["rule", "text-primary"],
    ["block", "text-status-revise-foreground"],
  ] as const)("variante %s : une ligne par élément, icône décorative teintée", (variant, tone) => {
    const { container } = render(<IconList variant={variant} items={["Un", "Deux"]} />);
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Un", "Deux"]);
    const icon = container.querySelector("svg");
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon?.getAttribute("class")).toContain(tone);
  });
});
