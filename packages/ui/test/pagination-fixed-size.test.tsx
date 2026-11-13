// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Pagination } from "../src/index.ts";

/** TK-107 lot C : pagination à taille imposée (jeux d'exemple, 25 lignes par page, maquette 11 l.275). */
describe("Pagination à taille imposée", () => {
  it("sans onSizeChange : texte « 25 lignes par page », aucun choix de taille", () => {
    render(<Pagination page={2} size={25} total={1240} onPageChange={() => undefined} />);
    expect(screen.getByText("25 lignes par page")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Lignes par page" })).toBeNull();
    expect(screen.getByRole("button", { name: "Page suivante" })).toBeEnabled();
  });

  it("avec onSizeChange : le choix de taille reste proposé", () => {
    render(
      <Pagination
        page={1}
        size={25}
        total={100}
        onPageChange={() => undefined}
        onSizeChange={() => undefined}
      />,
    );
    expect(screen.queryByText("25 lignes par page")).toBeNull();
  });
});
