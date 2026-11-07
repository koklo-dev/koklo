// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ToastInput, ToastProvider, useToast } from "../src/index.ts";

/** TK-139 lot B, cas 9 (fiche §3, DESIGN.md §5.6) : `Toast`, `ToastProvider`, `useToast`. */
function Launcher({ inputs }: { inputs: ToastInput[] }) {
  const { toast } = useToast();
  return (
    <button
      type="button"
      onClick={() => {
        for (const input of inputs) toast(input);
      }}
    >
      Lancer
    </button>
  );
}

function setup(inputs: ToastInput[]) {
  render(
    <ToastProvider>
      <Launcher inputs={inputs} />
    </ToastProvider>,
  );
  act(() => screen.getByRole("button", { name: "Lancer" }).click());
}

const flush = () => act(() => vi.advanceTimersByTimeAsync(50));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Toast", () => {
  it("région nommée « Notifications (F8) »", () => {
    setup([{ tone: "success", title: "Projet créé" }]);
    expect(screen.getByRole("region", { name: "Notifications (F8)" })).toBeInTheDocument();
  });

  it("succès et information annoncés en polite, erreur en assertive", async () => {
    setup([
      { tone: "success", title: "Enregistré" },
      { tone: "info", title: "Synchronisation" },
      { tone: "error", title: "Échec de l'envoi" },
    ]);
    await flush();
    const live = (text: string) =>
      Array.from(document.querySelectorAll("[aria-live]")).find(
        (el) => el.getAttribute("aria-live") !== "off" && el.textContent?.includes(text),
      );
    expect(live("Enregistré")).toHaveAttribute("aria-live", "polite");
    expect(live("Synchronisation")).toHaveAttribute("aria-live", "polite");
    expect(live("Échec de l'envoi")).toHaveAttribute("aria-live", "assertive");
  });

  it("mesures : rayon 10, fond --foreground, texte --background, --shadow-toast", () => {
    setup([{ tone: "success", title: "Projet créé" }]);
    const toast = screen.getByText("Projet créé").closest("[data-slot='toast']");
    expect(toast).toHaveClass(
      "rounded-card",
      "bg-foreground",
      "text-background",
      "shadow-toast",
      "px-3.5",
      "py-2.5",
    );
    expect(toast?.className).not.toMatch(/(^|\s)animate-/);
  });

  it("deux appels : les deux s'affichent dans l'ordre", () => {
    setup([
      { tone: "success", title: "Premier" },
      { tone: "info", title: "Second" },
    ]);
    const titles = Array.from(document.querySelectorAll("[data-slot='toast-title']")).map(
      (el) => el.textContent,
    );
    expect(titles).toEqual(["Premier", "Second"]);
  });

  it("se ferme après 5 s, 8 s pour une erreur", async () => {
    setup([
      { tone: "success", title: "Bref" },
      { tone: "error", title: "Long" },
    ]);
    await act(() => vi.advanceTimersByTimeAsync(5100));
    expect(screen.queryByText("Bref")).toBeNull();
    expect(screen.getByText("Long")).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(screen.queryByText("Long")).toBeNull();
  });

  it("durée suspendue au survol, reprise à la sortie", async () => {
    setup([{ tone: "success", title: "Survolé" }]);
    const viewport = screen.getByRole("region", { name: "Notifications (F8)" });
    await act(() => vi.advanceTimersByTimeAsync(3000));
    fireEvent.pointerMove(viewport);
    await act(() => vi.advanceTimersByTimeAsync(20000));
    expect(screen.getByText("Survolé")).toBeInTheDocument();
    fireEvent.pointerLeave(viewport);
    await act(() => vi.advanceTimersByTimeAsync(5100));
    expect(screen.queryByText("Survolé")).toBeNull();
  });

  it("durée suspendue au focus", async () => {
    setup([{ tone: "success", title: "Focalisé", action: { label: "OK", onClick: () => {} } }]);
    const viewport = screen.getByRole("region", { name: "Notifications (F8)" });
    await act(() => vi.advanceTimersByTimeAsync(3000));
    fireEvent.focus(screen.getByRole("button", { name: "OK" }));
    fireEvent.focusIn(viewport);
    await act(() => vi.advanceTimersByTimeAsync(20000));
    expect(screen.getByText("Focalisé")).toBeInTheDocument();
  });

  it("Échap ferme un toast focalisé", async () => {
    setup([{ tone: "success", title: "Fermable" }]);
    const viewport = screen.getByRole("region", { name: "Notifications (F8)" });
    fireEvent.keyDown(viewport, { key: "Escape" });
    await flush();
    expect(screen.queryByText("Fermable")).toBeNull();
  });

  it("l'action appelle son rappel puis ferme", async () => {
    const onClick = vi.fn();
    setup([{ tone: "error", title: "Échec", action: { label: "Annuler", onClick } }]);
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    await flush();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Échec")).toBeNull();
  });

  it("icône décorative : check_circle 18, ou error", () => {
    setup([
      { tone: "success", title: "Ok" },
      { tone: "error", title: "Ko" },
    ]);
    const icons = Array.from(document.querySelectorAll("[data-slot='toast'] [data-icon]"));
    expect(icons.map((icon) => icon.getAttribute("data-icon"))).toEqual(["check_circle", "error"]);
    for (const icon of icons) expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  it("useToast hors fournisseur lève une erreur explicite", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Launcher inputs={[]} />)).toThrow(/ToastProvider/);
  });
});
