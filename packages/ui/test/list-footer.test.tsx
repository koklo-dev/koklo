// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ListFooter } from "../src/index.ts";

/**
 * TK-94 lot B, T16 (passation 07 §1.1, DESIGN.md v2.1 §5.3, 02-design §2.1) : `ListFooter` et ses quatre états.
 * Cadre pointillé `--border-strong` sur `--surface`, rayon 12 ; textes exacts de la passation.
 */
const NOUN = { one: "fonctionnalité", other: "fonctionnalités" };
const footer = () => document.querySelector("[data-slot='list-footer']") as HTMLElement;

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("ListFooter", () => {
  it("suite à charger : icône, texte exact, bouton « Charger la suite »", async () => {
    const onLoadMore = vi.fn();
    render(<ListFooter state="more" pageSize={50} onLoadMore={onLoadMore} />);
    expect(footer()).toHaveAttribute("data-state", "more");
    expect(footer()).toHaveTextContent(
      "Les 50 suivantes se chargent automatiquement en approchant du bas.",
    );
    expect(footer().querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    await userEvent.click(screen.getByRole("button", { name: "Charger la suite" }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("« Charger la suite » est un vrai bouton dans l'ordre de tabulation", async () => {
    render(<ListFooter state="more" pageSize={50} onLoadMore={() => undefined} />);
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Charger la suite" })).toHaveFocus();
  });

  it("le texte suit la taille de page (24 pour une grille, 30 pour une colonne)", () => {
    render(<ListFooter state="more" pageSize={24} onLoadMore={() => undefined} />);
    expect(footer()).toHaveTextContent("Les 24 suivantes se chargent");
  });

  it("chargement : Spinner --primary, texte, aria-busy, aucun squelette ni action", () => {
    render(<ListFooter state="loading" pageSize={50} />);
    expect(footer()).toHaveAttribute("aria-busy", "true");
    expect(footer()).toHaveTextContent("Chargement des 50 suivantes…");
    expect(footer().querySelectorAll("[data-slot='skeleton']")).toHaveLength(0);
    expect(footer().querySelectorAll("[data-slot='skeleton-row']")).toHaveLength(0);
    const spinner = footer().querySelector("[data-slot='spinner']") as HTMLElement;
    expect(spinner.className).toMatch(/text-primary/);
    expect(spinner.className).toMatch(/motion-safe:animate-spin/);
    expect(spinner.querySelector("svg")).toHaveAttribute("width", "18");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("une seule ligne : pas de contenu sur toute la largeur (basis-full)", () => {
    render(<ListFooter state="loading" pageSize={50} />);
    expect(footer().innerHTML).not.toMatch(/basis-full/);
  });

  it("icônes de 18 px", () => {
    render(<ListFooter state="more" pageSize={50} onLoadMore={() => undefined} />);
    expect(footer().querySelector("svg")).toHaveAttribute("width", "18");
  });

  it("erreur : fond --alert-error, icône --alert-error-foreground, texte muted, bouton xs", () => {
    render(<ListFooter state="error" pageSize={50} loadedCount={50} onRetry={() => undefined} />);
    const alert = screen.getByRole("alert");
    expect(alert.className).toMatch(/bg-alert-error/);
    expect(alert.className).toMatch(/text-muted-foreground/);
    expect(alert.className).not.toMatch(/text-alert-error-foreground/);
    expect(alert.querySelector("svg")?.getAttribute("class")).toMatch(
      /text-alert-error-foreground/,
    );
    expect(screen.getByRole("button", { name: "Réessayer" }).className).toMatch(/\bh-7\b/);
  });

  it("erreur : role=alert, texte avec N, fond d'alerte, « Réessayer »", async () => {
    const onRetry = vi.fn();
    render(<ListFooter state="error" pageSize={50} loadedCount={100} onRetry={onRetry} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(
      "Impossible de charger la suite. Les 100 premières restent affichées.",
    );
    expect(footer().className).toMatch(/bg-alert-error/);
    expect(footer().className).not.toMatch(/border-alert-error-border/);
    expect(footer().className).toMatch(/border-border/);
    expect(screen.getByRole("button", { name: "Réessayer" })).toHaveClass("text-foreground");
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("erreur : « La première reste affichée » quand une seule ligne est chargée", () => {
    render(<ListFooter state="error" pageSize={50} loadedCount={1} onRetry={() => undefined} />);
    expect(screen.getByRole("alert")).toHaveTextContent("La première reste affichée.");
  });

  it("fin : texte avec le total et le nom, sans « Revenir en haut » par défaut", () => {
    render(<ListFooter state="end" total={1000} noun={NOUN} />);
    expect(footer()).toHaveTextContent("Fin de la liste · 1 000 fonctionnalités");
    expect(screen.queryByRole("button", { name: "Revenir en haut" })).toBeNull();
  });

  it("fin : « Revenir en haut » seulement si la liste dépasse deux écrans", async () => {
    const onBackToTop = vi.fn();
    render(<ListFooter state="end" total={1000} noun={NOUN} longList onBackToTop={onBackToTop} />);
    await userEvent.click(screen.getByRole("button", { name: "Revenir en haut" }));
    expect(onBackToTop).toHaveBeenCalledTimes(1);
  });

  it("version pleine : ligne de la planche 12 (bordure haute --border, --surface, texte à gauche)", () => {
    render(<ListFooter state="more" pageSize={50} onLoadMore={() => undefined} />);
    expect(footer().className).toMatch(/border-t/);
    expect(footer().className).toMatch(/flex-wrap/);
    expect(footer().className).toMatch(/bg-surface/);
    expect(footer().className).not.toMatch(/border-dashed/);
    expect(footer().className).not.toMatch(/flex-col/);
  });

  it("version compacte : cadre pointillé --border-strong sur --surface, rayon 12", () => {
    render(
      <ListFooter variant="compact" state="more" remaining={3} onLoadMore={() => undefined} />,
    );
    expect(footer().className).toMatch(/border-dashed/);
    expect(footer().className).toMatch(/border-border-strong/);
    expect(footer().className).toMatch(/bg-surface/);
    expect(footer().className).toMatch(/rounded-xl/);
  });

  it("seul l'état d'erreur annonce (alert) ; les autres ne parlent pas", () => {
    for (const state of ["more", "loading", "end"] as const) {
      const { unmount } = render(
        <ListFooter
          state={state}
          pageSize={50}
          total={3}
          noun={NOUN}
          onLoadMore={() => undefined}
        />,
      );
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.queryByRole("status")).toBeNull();
      unmount();
    }
  });

  it("version compacte du kanban : une ligne par état", () => {
    const { rerender } = render(
      <ListFooter
        variant="compact"
        state="more"
        pageSize={30}
        remaining={112}
        onLoadMore={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: "Charger la suite · 112 restantes" })).toBeVisible();
    rerender(<ListFooter variant="compact" state="loading" pageSize={30} />);
    expect(footer()).toHaveTextContent("Chargement…");
    rerender(
      <ListFooter variant="compact" state="error" pageSize={30} onRetry={() => undefined} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Impossible de charger la suite.");
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeVisible();
    rerender(<ListFooter variant="compact" state="end" endLabel="Fin de la colonne" />);
    expect(footer()).toHaveTextContent("Fin de la colonne");
  });
});

describe("ListFooter : variante encadrée et accord (TK-103)", () => {
  const PARCOURS = { one: "parcours", other: "parcours", masculine: true };
  it("masculin : « suivants », « premiers » ; féminin par défaut", () => {
    const { rerender } = render(<ListFooter state="more" pageSize={6} noun={PARCOURS} />);
    expect(footer()).toHaveTextContent("Les 6 suivants se chargent");
    rerender(<ListFooter state="loading" pageSize={6} noun={PARCOURS} />);
    expect(footer()).toHaveTextContent("Chargement des 6 suivants…");
    rerender(<ListFooter state="error" loadedCount={12} noun={PARCOURS} />);
    expect(footer()).toHaveTextContent("Les 12 premiers restent affichés.");
    rerender(<ListFooter state="more" pageSize={6} noun={NOUN} />);
    expect(footer()).toHaveTextContent("Les 6 suivantes se chargent");
  });
  it("framed : cadre bordé de rayon 10, 12 px", () => {
    render(<ListFooter state="end" total={3} framed />);
    expect(footer()).toHaveClass("rounded-[10px]", "border", "text-caption", "font-normal");
    expect(footer()).not.toHaveClass("border-t");
  });
  it("attached : sous un tableau cadré, sans bord haut, coins bas arrondis (maquette 11 l.241)", () => {
    render(<ListFooter state="end" total={3} attached />);
    expect(footer()).toHaveClass("rounded-b-xl", "border", "border-t-0", "text-caption");
    expect(footer()).not.toHaveClass("rounded-[10px]");
  });
});
