// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VirtualList } from "../src/index.ts";
import {
  FakeIntersectionObserver,
  installIntersectionObserver,
  mockViewport,
  restoreViewport,
} from "./helpers/virtual.ts";

/**
 * TK-94 lot B, T15 (passation 07 §1.1 et §5, DESIGN.md v2.1 §5.3, 02-design §3 et §5) : `VirtualList`.
 * Lignes de hauteur fixe, seules les lignes visibles + 10 de marge dans le DOM, `aria-setsize` = total du serveur,
 * `aria-posinset` = rang réel, sentinelle à 80 %, une seule entrée au clavier, focus conservé quand la liste grandit.
 */
interface Row {
  id: string;
  title: string;
}

const rows = (count: number, from = 0): Row[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `F-${from + i + 1}`,
    title: `Fonctionnalité ${from + i + 1}`,
  }));

type Props = Partial<Parameters<typeof VirtualList<Row>>[0]>;

function renderList(props: Props = {}) {
  const base = {
    items: rows(100),
    total: 1000,
    label: "Fonctionnalités",
    getItemKey: (row: Row) => row.id,
    renderItem: (row: Row) => <span>{row.title}</span>,
  };
  const view = render(<VirtualList<Row> {...base} {...props} />);
  const again = (next: Props = {}) =>
    view.rerender(<VirtualList<Row> {...base} {...props} {...next} />);
  return { ...view, again };
}

const listitems = () => screen.queryAllByRole("listitem");

beforeEach(() => {
  mockViewport(520);
  installIntersectionObserver();
});
afterEach(() => {
  restoreViewport();
  vi.unstubAllGlobals();
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("VirtualList : fenêtre et sémantique", () => {
  it("monte au plus fenêtre + 20 lignes pour 1 000 éléments chargés", () => {
    renderList({ items: rows(1000) });
    const count = listitems().length;
    expect(count).toBeGreaterThan(0);
    // fenêtre de 520 px / 52 px = 10 lignes (+1 partielle), plus 10 de marge de chaque côté
    expect(count).toBeLessThanOrEqual(11 + 20);
  });

  it("role=list nommé, role=listitem sur chaque ligne", () => {
    renderList();
    const list = screen.getByRole("list", { name: "Fonctionnalités" });
    expect(within(list).getAllByRole("listitem").length).toBe(listitems().length);
  });

  it("aria-setsize = total du serveur (1 000) et non le nombre chargé (100)", () => {
    renderList();
    for (const item of listitems()) expect(item).toHaveAttribute("aria-setsize", "1000");
  });

  it("aria-posinset = rang réel : 1 pour la première ligne", () => {
    renderList();
    const first = listitems()[0];
    expect(first).toHaveAttribute("aria-posinset", "1");
    expect(first).toHaveTextContent("Fonctionnalité 1");
  });

  it("aria-posinset part de startIndex (lien direct hors première page)", () => {
    renderList({ items: rows(50, 150), startIndex: 150 });
    const first = listitems()[0];
    expect(first).toHaveAttribute("aria-posinset", "151");
    expect(first).toHaveTextContent("Fonctionnalité 151");
    expect(listitems()[1]).toHaveAttribute("aria-posinset", "152");
  });

  it("hauteur de ligne 52 px par défaut, 44 px pour la relecture", () => {
    const first = renderList();
    expect(listitems()[0]).toHaveStyle({ height: "52px" });
    first.unmount();
    renderList({ rowHeight: 44 });
    expect(listitems()[0]).toHaveStyle({ height: "44px" });
  });

  it("framed : cadre bordé de rayon 12 sur le conteneur défilant", () => {
    renderList({ framed: true });
    const box = document.querySelector("[data-slot='virtual-list']") as HTMLElement;
    for (const cls of [
      /rounded-xl/,
      /\bborder\b/,
      /border-border/,
      /overflow-hidden|overflow-y-auto/,
    ]) {
      expect(box.className).toMatch(cls);
    }
  });

  it("sans framed : aucun cadre", () => {
    renderList();
    const box = document.querySelector("[data-slot='virtual-list']") as HTMLElement;
    expect(box.className).not.toMatch(/rounded-xl/);
  });

  it("loadingRows={4} : 4 SkeletonRow aria-hidden après les lignes, sans double bordure, aria-busy gardé", () => {
    renderList({ items: rows(3), total: 3, loadingRows: 4 });
    const skeletons = [...document.querySelectorAll("[data-slot='skeleton-row']")];
    expect(skeletons).toHaveLength(4);
    for (const row of skeletons) expect(row).toHaveAttribute("aria-hidden", "true");
    const list = screen.getByRole("list");
    expect(list).toHaveAttribute("aria-busy", "true");
    expect(
      list.compareDocumentPosition(skeletons[0] as Element) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect((skeletons[0] as HTMLElement).className).toMatch(/border-t/);
    expect((skeletons[0] as HTMLElement).className).not.toMatch(/first:border-t-0/);
    expect((skeletons[1] as HTMLElement).className).toMatch(/border-t/);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("sans loadingRows : aucun squelette ; aria-setsize inchangé avec loadingRows", () => {
    renderList();
    expect(document.querySelectorAll("[data-slot='skeleton-row']")).toHaveLength(0);
    document.body.innerHTML = "";
    renderList({ loadingRows: 4 });
    for (const item of listitems()) expect(item).toHaveAttribute("aria-setsize", "1000");
  });

  it("la liste porte aria-busy pendant un rechargement", () => {
    const { again } = renderList();
    expect(screen.getByRole("list")).not.toHaveAttribute("aria-busy", "true");
    again({ busy: true });
    expect(screen.getByRole("list")).toHaveAttribute("aria-busy", "true");
  });

  it("ligne sélectionnée : aria-current, fond --secondary et bande --primary", () => {
    renderList({ selectedKey: "F-3" });
    const selected = listitems().filter((el) => el.getAttribute("aria-current") === "true");
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent("Fonctionnalité 3");
    expect(selected[0]?.className).toMatch(/bg-secondary/);
    expect(selected[0]?.className).toMatch(/before:bg-primary/);
  });

  it("les lignes sont séparées par --border et survolées en --accent", () => {
    renderList();
    expect(listitems()[0]?.className).not.toMatch(/border-[tb]\b/);
    expect(listitems()[1]?.className).toMatch(/border-t\b/);
    expect(listitems()[1]?.className).not.toMatch(/border-b\b/);
    expect(listitems()[0]?.className).toMatch(/hover:bg-accent/);
  });

  it("le pied est rendu sous la liste, dans la zone défilante", () => {
    renderList({ footer: <p>Pied de liste</p> });
    const footer = screen.getByText("Pied de liste");
    const list = screen.getByRole("list");
    expect(list.contains(footer)).toBe(false);
    expect(footer.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it("centerOnKey amène la ligne dans la fenêtre (lien direct ?sel=)", () => {
    renderList({ items: rows(300), total: 1000, centerOnKey: "F-187" });
    const texts = listitems().map((el) => el.textContent);
    expect(texts).toContain("Fonctionnalité 187");
  });

  it("initialScrollOffset restaure la position (retour depuis la fiche)", () => {
    renderList({ items: rows(300), initialScrollOffset: 52 * 120 });
    expect(listitems().map((el) => el.textContent)).toContain("Fonctionnalité 121");
  });

  it("onScrollOffsetChange rend la position pour la mémoriser", () => {
    const onScrollOffsetChange = vi.fn();
    renderList({ onScrollOffsetChange });
    const scroller = screen.getByRole("list").closest("[data-slot='virtual-list']") as HTMLElement;
    scroller.scrollTop = 780;
    fireEvent.scroll(scroller);
    expect(onScrollOffsetChange).toHaveBeenLastCalledWith(780);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("VirtualList : sentinelle à 80 %", () => {
  const sentinel = (which: "end" | "start") =>
    document.querySelector(`[data-sentinel='${which}']`) as HTMLElement | null;

  it("la sentinelle de fin est placée à 80 % de la hauteur chargée, hors de role=list", () => {
    renderList({ items: rows(100), hasMore: true });
    const el = sentinel("end");
    expect(el).not.toBeNull();
    expect(el).toHaveStyle({ top: `${0.8 * 100 * 52}px` });
    expect(screen.getByRole("list").contains(el)).toBe(false);
    expect(el).toHaveAttribute("aria-hidden", "true");
  });

  it("la zone de fin couvre les 20 % restants, celle de début les 20 % du haut : un saut de défilement la rencontre", () => {
    renderList({ items: rows(100), hasMore: true, hasPrevious: true, startIndex: 100 });
    const total = 100 * 52;
    expect(sentinel("end")).toHaveStyle({ top: `${0.8 * total}px`, height: `${0.2 * total}px` });
    expect(sentinel("start")).toHaveStyle({ top: "0px", height: `${0.2 * total}px` });
  });

  it("demande la suite quand la sentinelle devient visible", () => {
    const onLoadMore = vi.fn();
    renderList({ hasMore: true, onLoadMore });
    expect(onLoadMore).not.toHaveBeenCalled();
    act(() => FakeIntersectionObserver.intersect("end"));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("ne demande pas deux fois la même page", () => {
    const onLoadMore = vi.fn();
    renderList({ hasMore: true, onLoadMore });
    act(() => FakeIntersectionObserver.intersect("end"));
    act(() => FakeIntersectionObserver.intersect("end"));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("redemande après l'arrivée d'une page", () => {
    const onLoadMore = vi.fn();
    const { again } = renderList({ items: rows(50), hasMore: true, onLoadMore });
    act(() => FakeIntersectionObserver.intersect("end"));
    again({ items: rows(100), hasMore: true, onLoadMore });
    act(() => FakeIntersectionObserver.intersect("end"));
    expect(onLoadMore).toHaveBeenCalledTimes(2);
  });

  it("ne demande rien sans suite, ou pendant un chargement", () => {
    const onLoadMore = vi.fn();
    const first = renderList({ hasMore: false, onLoadMore });
    act(() => FakeIntersectionObserver.intersect("end"));
    first.unmount();
    renderList({ hasMore: true, isLoadingMore: true, onLoadMore });
    act(() => FakeIntersectionObserver.intersect("end"));
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it("sans suite il n'y a pas de sentinelle de fin", () => {
    renderList({ hasMore: false });
    expect(sentinel("end")).toBeNull();
  });

  it("demande les lignes précédentes par la sentinelle de début", () => {
    const onLoadPrevious = vi.fn();
    renderList({ items: rows(50, 150), startIndex: 150, hasPrevious: true, onLoadPrevious });
    act(() => FakeIntersectionObserver.intersect("start"));
    expect(onLoadPrevious).toHaveBeenCalledTimes(1);
  });

  it("garde la position quand des lignes sont ajoutées au-dessus", () => {
    const { again } = renderList({ items: rows(50, 150), startIndex: 150, hasPrevious: true });
    const scroller = screen.getByRole("list").closest("[data-slot='virtual-list']") as HTMLElement;
    scroller.scrollTop = 200;
    again({ items: rows(100, 100), startIndex: 100, hasPrevious: true });
    expect(scroller.scrollTop).toBe(200 + 50 * 52);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("VirtualList : clavier et focus", () => {
  it("une seule entrée dans la liste : un seul tabindex=0", () => {
    renderList({ items: rows(20) });
    const stops = listitems().filter((el) => el.getAttribute("tabindex") === "0");
    expect(stops).toHaveLength(1);
    expect(stops[0]).toHaveTextContent("Fonctionnalité 1");
  });

  it("la ligne sélectionnée est l'entrée de la liste", () => {
    renderList({ items: rows(20), selectedKey: "F-4" });
    const stop = listitems().find((el) => el.getAttribute("tabindex") === "0");
    expect(stop).toHaveTextContent("Fonctionnalité 4");
  });

  it("flèche bas / haut déplacent le focus entre les lignes", async () => {
    const user = userEvent.setup();
    renderList({ items: rows(20) });
    listitems()[0]?.focus();
    await user.keyboard("{ArrowDown}");
    expect(listitems()[1]).toHaveFocus();
    await user.keyboard("{ArrowDown}{ArrowUp}");
    expect(listitems()[1]).toHaveFocus();
  });

  it("Début et Fin vont aux extrémités chargées", async () => {
    const user = userEvent.setup();
    renderList({ items: rows(20) });
    listitems()[0]?.focus();
    await user.keyboard("{End}");
    expect(document.activeElement).toHaveTextContent("Fonctionnalité 20");
    await user.keyboard("{Home}");
    expect(document.activeElement).toHaveTextContent("Fonctionnalité 1");
  });

  it("flèche bas sur la dernière ligne chargée demande la suite", async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    renderList({ items: rows(5), hasMore: true, onLoadMore });
    listitems()[4]?.focus();
    await user.keyboard("{ArrowDown}");
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("Entrée et Espace activent la ligne, un clic aussi", async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    renderList({ items: rows(5), onActivate });
    listitems()[2]?.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    await user.click(listitems()[3] as HTMLElement);
    expect(onActivate.mock.calls.map(([row]) => row.id)).toEqual(["F-3", "F-3", "F-4"]);
  });

  it("le focus reste sur la ligne active quand la liste grandit", async () => {
    const user = userEvent.setup();
    const { again } = renderList({ items: rows(50), hasMore: true });
    await user.click(listitems()[3] as HTMLElement);
    const active = document.activeElement;
    expect(active).toHaveTextContent("Fonctionnalité 4");
    again({ items: rows(100), hasMore: true });
    expect(document.activeElement).toBe(active);
  });

  it("la ligne active reste dans le DOM quand elle sort de la fenêtre (le focus ne tombe pas)", async () => {
    const user = userEvent.setup();
    renderList({ items: rows(300) });
    await user.click(listitems()[3] as HTMLElement);
    const active = document.activeElement;
    const scroller = screen.getByRole("list").closest("[data-slot='virtual-list']") as HTMLElement;
    scroller.scrollTop = 52 * 150;
    fireEvent.scroll(scroller);
    expect(listitems().map((el) => el.textContent)).toContain("Fonctionnalité 151");
    expect(active?.isConnected).toBe(true);
    expect(document.activeElement).toBe(active);
  });
});
