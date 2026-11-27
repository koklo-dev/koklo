// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExpectationBox } from "../src/index.ts";

/** TK-117 lot C : « Ce que nous attendons de vous » (maquette 15 l.211, 825-826). */
describe("ExpectationBox", () => {
  it("ambre tant que l'attente est ouverte, bordée ensuite, avec son action", () => {
    const { rerender } = render(
      <ExpectationBox
        pending
        title="Ce que nous attendons de vous"
        action={<button type="button">Indiquer un contact</button>}
      >
        Le nom et le téléphone.
      </ExpectationBox>,
    );
    const box = screen.getByRole("region", { name: "Ce que nous attendons de vous" });
    expect(box.className).toContain("bg-alert-warning");
    expect(screen.getByRole("button", { name: "Indiquer un contact" })).toBeInTheDocument();
    rerender(<ExpectationBox title="Ce que nous attendons de vous">Merci.</ExpectationBox>);
    expect(screen.getByRole("region").className).not.toContain("bg-alert-warning");
  });
});
