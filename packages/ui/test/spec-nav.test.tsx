// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell, SPEC_DELIVERABLES, SpecNav } from "../src/index.ts";
import { DESKTOP, setViewport } from "./viewport.ts";

/** TK-88 lot B : groupe SPEC (décision 21 §0, planche 10, 02-design §4 ; B2). */
const ORDER = [
  "Fonctionnel",
  "Données",
  "Architecture",
  "Technique",
  "Sécurité",
  "Design",
  "Qualité",
];
const HREFS = { functional: "/projects/p1/spec/functional" };

beforeEach(() => {
  setViewport(DESKTOP);
  localStorage.clear();
});

describe("SPEC_DELIVERABLES", () => {
  it("sept livrables dans l'ordre Fonctionnel … Qualité, Sécurité en 5", () => {
    expect(SPEC_DELIVERABLES.map((d) => d.label)).toEqual(ORDER);
    expect(SPEC_DELIVERABLES.map((d) => d.key)).toEqual([
      "functional",
      "data",
      "architecture",
      "technical",
      "security",
      "design",
      "quality",
    ]);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("SpecNav", () => {
  it("groupe nommé « Spec » avec le compteur mono N/7, sans chevron ni repli", () => {
    render(<SpecNav hrefs={HREFS} activeKey="functional" validatedCount={2} />);
    const group = screen.getByRole("group", { name: "Spec" });
    expect(within(group).getByText("2/7").className).toContain("font-mono");
    expect(group.querySelector("[aria-expanded]")).toBeNull();
    expect(within(group).queryByRole("button", { name: /^Spec/ })).toBeNull();
    expect(group.querySelector("svg[class*='chevron'],[data-slot='chevron']")).toBeNull();
  });

  it("compteur 0/7 par défaut (aucun livrable validable)", () => {
    render(<SpecNav hrefs={HREFS} />);
    expect(screen.getByText("0/7")).toBeVisible();
  });

  it("sept entrées numérotées dans l'ordre", () => {
    render(<SpecNav hrefs={HREFS} />);
    const items = within(screen.getByRole("group", { name: "Spec" })).getAllByRole("listitem");
    expect(items).toHaveLength(7);
    items.forEach((item, i) => {
      expect(item.textContent).toContain(ORDER[i] as string);
      const rank = item.querySelector("[data-slot='spec-number']");
      expect(rank).toHaveAttribute("data-rank", String(i + 1));
      expect(rank).toHaveAttribute("aria-hidden", "true");
    });
  });

  it("entrée disponible : vrai lien ; entrée active : aria-current, fond --background, icône --primary", () => {
    render(<SpecNav hrefs={HREFS} activeKey="functional" />);
    const link = screen.getByRole("link", { name: "Fonctionnel" });
    expect(link).toHaveAttribute("href", HREFS.functional);
    expect(link).toHaveAttribute("aria-current", "page");
    expect(link.className).toContain("bg-background");
    expect(link.querySelector("svg:not([data-slot='spec-lock'])")?.getAttribute("class")).toContain(
      "text-primary",
    );
  });

  it("entrée verrouillée : bouton aria-disabled focalisable, nom « Données, disponible après le fonctionnel », cadenas", async () => {
    render(<SpecNav hrefs={HREFS} />);
    const locked = screen.getByRole("button", { name: "Données, disponible après le fonctionnel" });
    expect(locked).toHaveAttribute("aria-disabled", "true");
    expect(locked).not.toHaveAttribute("disabled");
    expect(locked.querySelector("[data-slot='spec-lock']")).not.toBeNull();
    expect(locked.querySelector("[data-slot='spec-lock']")).toHaveAttribute("aria-hidden", "true");
    await userEvent.tab();
    await userEvent.tab();
    expect(locked).toHaveFocus();
  });

  it.each([
    ["Données", "Disponible après le fonctionnel"],
    ["Architecture", "Disponible après les données"],
    ["Technique", "Disponible après l'architecture"],
    ["Sécurité", "Disponible après le technique"],
    ["Design", "Disponible après le fonctionnel"],
    ["Qualité", "Disponible après le technique, la sécurité et le design"],
  ])("la condition de %s est dans l'infobulle ouverte au focus", async (label, condition) => {
    render(<SpecNav hrefs={HREFS} />);
    const locked = screen.getByRole("button", { name: new RegExp(`^${label}, disponible`) });
    locked.focus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent(condition);
  });

  it("un verrou ne navigue pas : ni lien parent, ni action au clic ou à Entrée", async () => {
    const onClick = vi.fn((event: MouseEvent) => event.preventDefault());
    document.addEventListener("click", onClick);
    render(<SpecNav hrefs={HREFS} />);
    const locked = screen.getByRole("button", { name: /^Données/ });
    await userEvent.click(locked);
    locked.focus();
    await userEvent.keyboard("{Enter}");
    document.removeEventListener("click", onClick);
    expect(locked.closest("a")).toBeNull();
    expect(onClick.mock.calls.every(([e]) => e.defaultPrevented)).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("fail-closed : une entrée sans lien est verrouillée, même Fonctionnel", () => {
    render(<SpecNav hrefs={{}} />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getAllByRole("button")).toHaveLength(7);
  });

  it("chargement : sept squelettes, groupe aria-busy, ni lien ni bouton", () => {
    render(<SpecNav hrefs={{}} loading />);
    const group = screen.getByRole("group", { name: "Spec" });
    expect(group).toHaveAttribute("aria-busy", "true");
    expect(group.querySelectorAll("[data-slot='skeleton']")).toHaveLength(7);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("rail replié : trait de 24 px et icônes avec aria-label « Spec · Fonctionnel »", async () => {
    localStorage.setItem("koklo.sidebar", "collapsed");
    render(
      <AppShell sidebar={<SpecNav hrefs={HREFS} />} mobileTitle="Koklo">
        <main />
      </AppShell>,
    );
    const link = await screen.findByRole("link", { name: "Spec · Fonctionnel" });
    expect(link).not.toHaveTextContent("Fonctionnel");
    expect(document.querySelector("[data-slot='spec-rule']")?.className).toContain("w-6");
    expect(screen.queryByText("0/7")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Données, disponible après le fonctionnel" }),
    ).toHaveAttribute("aria-disabled", "true");
  });
});
