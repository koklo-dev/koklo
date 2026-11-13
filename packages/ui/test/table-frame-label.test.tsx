// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Table, TableBody, TableCell, TableRow } from "../src/index.ts";

/** TK-107 lot C : région défilante nommée d'un tableau encadré (375 px : le tableau défile dans son cadre). */
const body = (
  <TableBody>
    <TableRow>
      <TableCell>a</TableCell>
    </TableRow>
  </TableBody>
);

describe("Table : frameLabel", () => {
  it("un tableau encadré nommé est une région focusable", () => {
    render(
      <Table framed frameLabel="Tables du modèle de données">
        {body}
      </Table>,
    );
    const region = screen.getByRole("region", { name: "Tables du modèle de données" });
    expect(region).toHaveAttribute("tabindex", "0");
  });

  it("sans frameLabel ou sans cadre : aucune région", () => {
    const { rerender } = render(<Table framed>{body}</Table>);
    expect(screen.queryByRole("region")).toBeNull();
    rerender(<Table frameLabel="x">{body}</Table>);
    expect(screen.queryByRole("region")).toBeNull();
  });
});
