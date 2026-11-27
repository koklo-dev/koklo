// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CoverageTable } from "../src/index.ts";

/** TK-117 lot C : couverture ASVS (maquette 15 l.191-196, 552-555). */
const ROWS = [
  {
    id: "a",
    name: "Authentification",
    answered: 4,
    total: 4,
    where: "F-009",
    status: "covered" as const,
  },
  { id: "b", name: "Journalisation", answered: 1, total: 3, where: "", status: "missing" as const },
  { id: "c", name: "API", answered: 0, total: 0, where: "", status: "to_check" as const },
];

describe("CoverageTable", () => {
  it("valeur écrite, barre décorative ambre s'il manque, pastille d'état", () => {
    render(<CoverageTable rows={ROWS} />);
    const table = screen.getByRole("table", { name: "Couverture par chapitre" });
    expect(table.className).toContain("min-w-[760px]");
    expect(screen.queryByRole("progressbar")).toBeNull();
    const missing = screen.getByRole("row", { name: /Journalisation/ });
    expect(missing).toHaveTextContent("1 / 3");
    expect(missing.querySelector(".bg-status-pending-icon")).not.toBeNull();
    const pill = (label: string) =>
      screen.getByText(label).closest("[data-slot='pill']")?.getAttribute("data-tone");
    expect(pill("Couvert")).toBe("success");
    expect(pill("2 sans réponse")).toBe("warning");
    expect(pill("À vérifier")).toBe("outline");
  });
});
