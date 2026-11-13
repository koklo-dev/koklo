// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ErTableCard, erTypeLabel } from "../src/index.ts";

/** TK-107 lot C : carte de table du diagramme entité-relation (DESIGN.md §5.18, maquette 11 l.404-412). */
const FIELDS = [
  { name: "id", type: "uuid", kind: "primary" },
  { name: "client_id", type: "ref(T-client)", kind: "reference" },
  { name: "email", type: "texte(120)", kind: "personal" },
  { name: "statut", type: "enum", kind: "plain" },
] as const;

function card(props: Partial<Parameters<typeof ErTableCard>[0]> = {}) {
  return render(
    <ul>
      <ErTableCard id="T-reservation" name="Réservation" fields={FIELDS} {...props} />
    </ul>,
  );
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("ErTableCard", () => {
  it("est un élément de liste nommé « Table <nom>, N champs »", () => {
    card();
    const item = screen.getByRole("listitem", { name: "Table Réservation, 4 champs" });
    expect(item.className).toContain("w-[230px]");
    expect(item.className).toContain("rounded-[10px]");
    expect(item.className).toContain("overflow-hidden");
  });

  it("accorde « 1 champ » au singulier", () => {
    card({ fields: [FIELDS[0]] });
    expect(
      screen.getByRole("listitem", { name: "Table Réservation, 1 champ" }),
    ).toBeInTheDocument();
  });

  it("montre le nom, l'identifiant en mono et une ligne de 22 par champ", () => {
    card();
    const item = screen.getByRole("listitem");
    expect(within(item).getByText("Réservation").className).toContain("font-semibold");
    expect(within(item).getByText("T-reservation").className).toContain("font-mono");
    const rows = item.querySelectorAll("[data-slot='er-field']");
    expect(rows).toHaveLength(4);
    expect(rows[0]?.className).toContain("h-[22px]");
  });

  it("distingue clé primaire, référence et donnée personnelle par l'icône, jamais par le texte seul", () => {
    card();
    const kinds = [...document.querySelectorAll("[data-slot='er-field']")].map((row) =>
      row.getAttribute("data-kind"),
    );
    expect(kinds).toEqual(["primary", "reference", "personal", "plain"]);
    const icons = [...document.querySelectorAll("[data-slot='er-field'] svg")];
    expect(icons.every((icon) => icon.getAttribute("aria-hidden") === "true")).toBe(true);
    expect(document.querySelector("[data-kind='primary'] svg")?.getAttribute("class")).toContain(
      "text-status-pending-icon",
    );
    expect(document.querySelector("[data-kind='reference'] svg")?.getAttribute("class")).toContain(
      "text-primary",
    );
  });

  it("rend ref(T-client) en →T-client, les autres types tels quels", () => {
    expect(erTypeLabel("ref(T-client)")).toBe("→T-client");
    expect(erTypeLabel("texte(120)")).toBe("texte(120)");
    card();
    expect(screen.getByText("→T-client")).toBeInTheDocument();
  });

  it("à relire : bordure en pointillés et pastille « À relire »", () => {
    card({ state: "review" });
    const item = screen.getByRole("listitem");
    expect(item.className).toContain("border-dashed");
    expect(within(item).getByText("À relire")).toBeInTheDocument();
  });

  it("rejetée : estompée par les jetons (jamais l'opacité : contraste AA), nom barré, pastille « Rejetée »", () => {
    card({ state: "rejected" });
    const item = screen.getByRole("listitem");
    expect(item.className).toContain("text-muted-foreground");
    expect(item.className).not.toMatch(/opacity/);
    expect(within(item).getByText("Réservation").className).toContain("line-through");
    expect(within(item).getByText("Rejetée")).toBeInTheDocument();
  });

  it("sans état : ni pastille ni pointillés", () => {
    card();
    const item = screen.getByRole("listitem");
    expect(item.className).not.toContain("border-dashed");
    expect(within(item).queryByText("À relire")).toBeNull();
  });
});
