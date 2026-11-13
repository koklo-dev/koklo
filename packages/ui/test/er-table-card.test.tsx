// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ErTableCard, erTableHeight, erTypeLabel } from "../src/index.ts";

/** TK-107 lot C : carte de table du diagramme entité-relation (DESIGN.md §5.18, maquette 11 l.404-412). */
const FIELDS = [
  { name: "id", type: "uuid", kind: "primary" },
  { name: "client_id", type: "ref(T-client)", kind: "reference" },
  { name: "email", type: "texte(120)", kind: "personal" },
  { name: "statut", type: "enum", kind: "plain" },
] as const;

function card(props: Partial<Parameters<typeof ErTableCard>[0]> = {}) {
  return render(<ErTableCard id="T-reservation" name="Réservation" fields={FIELDS} {...props} />);
}

const root = () => document.querySelector("[data-slot='er-table-card']") as HTMLElement;

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("ErTableCard", () => {
  it("est un button aria-pressed nommé « Table <nom>, N champs »", () => {
    card();
    const button = screen.getByRole("button", { name: "Table Réservation, 4 champs" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).toHaveAttribute("type", "button");
    const item = root();
    expect(item.className).toContain("w-[230px]");
    expect(item.className).toContain("rounded-[10px]");
    expect(item.className).toContain("overflow-hidden");
  });

  it("accorde « 1 champ » au singulier", () => {
    card({ fields: [FIELDS[0]] });
    expect(screen.getByRole("button", { name: "Table Réservation, 1 champ" })).toBeInTheDocument();
  });

  it("montre le nom, l'identifiant en mono et une ligne de 22 par champ", () => {
    card();
    const item = root();
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
    const item = root();
    expect(item.className).toContain("border-dashed");
    expect(within(item).getByText("À relire")).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveAccessibleDescription("À relire");
  });

  it("rejetée : estompée par les jetons (jamais l'opacité : contraste AA), nom barré, pastille « Rejetée »", () => {
    card({ state: "rejected" });
    const item = root();
    expect(item.className).toContain("text-muted-foreground");
    expect(item.className).not.toMatch(/opacity/);
    expect(within(item).getByText("Réservation").className).toContain("line-through");
    expect(within(item).getByText("Rejetée")).toBeInTheDocument();
  });

  it("sans état : ni pastille ni pointillés", () => {
    card();
    const item = root();
    expect(item.className).not.toContain("border-dashed");
    expect(within(item).queryByText("À relire")).toBeNull();
  });

  it("sélectionnée : aria-pressed, bordure 2 --primary, en-tête --primary, ombre", () => {
    card({ selected: true });
    const item = root();
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
    expect(item.className).toContain("border-2");
    expect(item.className).toContain("border-primary");
    expect(item.className).toContain("shadow-floating");
    const header = item.querySelector("[data-slot='er-header']");
    expect(header?.className).toContain("bg-primary");
    expect(header?.className).toContain("text-primary-foreground");
  });

  it("appelle onSelect au clic et à Entrée", async () => {
    const onSelect = vi.fn();
    card({ onSelect });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button"));
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it("compact : plus de ligne de champ, le nom garde « N champs »", () => {
    card({ compact: true });
    expect(document.querySelectorAll("[data-slot='er-field']")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Table Réservation, 4 champs" })).toBeInTheDocument();
    expect(screen.getByText("Réservation")).toBeInTheDocument();
  });

  it("accepte un style de position ; le button est vide (son nom ne répète pas le texte visible, WCAG 2.5.3)", () => {
    card({ style: { left: 12 } });
    expect(root().style.left).toBe("12px");
    const button = screen.getByRole("button");
    expect(button).toBeEmptyDOMElement();
    expect(button.closest("[aria-hidden='true']")).toBeNull();
    expect(screen.getByText("Réservation").closest("[aria-hidden='true']")).not.toBeNull();
  });

  it("erTableHeight : 36 + 22 par champ + 6 (maquette 11 l.376-388)", () => {
    expect(erTableHeight(6)).toBe(174);
    expect(erTableHeight(0)).toBe(42);
  });
});
