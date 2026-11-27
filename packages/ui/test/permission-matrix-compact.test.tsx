// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PermissionMatrix } from "../src/index.ts";

/** TK-117 lot C : matrice des droits de la Sécurité (maquette 15 l.174-179, 545-547). */
const ROLES = [
  { id: "RL-a", name: "Cliente" },
  { id: "RL-b", name: "Gérante" },
  { id: "RL-c", name: "Accueil" },
];
const ACTIONS = [
  {
    id: "PM-x.y",
    label: "Voir",
    access: [
      { level: "restricted" as const, restriction: "Les siens" },
      { level: "allowed" as const },
      { level: "denied" as const },
    ],
  },
];

describe("PermissionMatrix compacte", () => {
  it("sans filtre : cases nommées « rôle : oui, non, restreint » et restriction écrite", () => {
    render(<PermissionMatrix variant="compact" roles={ROLES} actions={ACTIONS} />);
    expect(screen.queryByRole("searchbox")).toBeNull();
    const table = screen.getByRole("table", { name: "Matrice des droits" });
    expect(table.className).toContain("min-w-[820px]");
    expect(
      screen.getByRole("img", { name: "Cliente : restreint (Les siens)" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Gérante : oui" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Accueil : non" })).toBeInTheDocument();
    expect(screen.getByText("Les siens")).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Voir" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /Matrice des droits/ })).toHaveAttribute(
      "tabindex",
      "0",
    );
  });
});
