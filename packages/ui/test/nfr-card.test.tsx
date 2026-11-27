// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NfrCard, NfrCategory } from "../src/index.ts";

/** TK-116 lot B : catégorie et carte d'une exigence (DESIGN.md §5.27, maquette 14 l.263-275, 668-670). */
function card(props: Partial<Parameters<typeof NfrCard>[0]> = {}) {
  return render(
    <NfrCard
      id="NFR-003"
      title="Temps de réponse de l'API"
      target="p95 < 300 ms"
      statement="Les opérations répondent vite."
      verification="Mesure en CI"
      {...props}
    />,
  );
}
const article = () => screen.getByRole("article");

describe("NfrCategory", () => {
  it("section nommée : titre h2 en capitales avec le compte, grille qui se remplit", () => {
    render(
      <NfrCategory label="Performance" icon="speed" count={2}>
        <span>carte</span>
      </NfrCategory>,
    );
    const heading = screen.getByRole("heading", { level: 2, name: "Performance 2" });
    expect(heading.className).toContain("uppercase");
    expect(screen.getByRole("region", { name: "Performance 2" })).toBeInTheDocument();
    const grid = screen.getByText("carte").parentElement as HTMLElement;
    expect(grid.className).toContain("grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))]");
  });
});

describe("NfrCard", () => {
  it("identifiant, titre, cible, énoncé, vérification ; sans couverture : aucune pastille", () => {
    card();
    expect(article()).toHaveAccessibleName("NFR-003 Temps de réponse de l'API");
    for (const text of ["NFR-003", "p95 < 300 ms", "Les opérations répondent vite."]) {
      expect(within(article()).getByText(text)).toBeVisible();
    }
    expect(within(article()).getByText("Mesure en CI")).toBeVisible();
    expect(within(article()).queryByText(/Couverte|À couvrir/)).toBeNull();
    expect(within(article()).queryByRole("button")).toBeNull();
  });

  it.each([
    ["covered", "Couverte", "success"],
    ["uncovered", "À couvrir", "warning"],
  ] as const)("couverture %s : pastille « %s »", (coverage, label, tone) => {
    card({ coverage });
    expect(screen.getByText(label)).toHaveAttribute("data-tone", tone);
  });

  it("« Modifier NFR-003 » appelle l'écriture", async () => {
    const onEdit = vi.fn();
    card({ onEdit });
    await userEvent.click(screen.getByRole("button", { name: "Modifier NFR-003" }));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it("à revoir : contour ambre et « à revoir » dans le nom ; proposée : pointillé", () => {
    const { unmount } = card({ stale: true });
    expect(article()).toHaveAccessibleName("NFR-003 Temps de réponse de l'API, à revoir");
    expect(article().className).toContain("border-status-pending-icon");
    unmount();
    card({ proposed: true });
    expect(article().className).toContain("border-dashed");
  });
});
