// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandPalette, type CommandPaletteGroup } from "../src/index.ts";

/** TK-88 lot D : clavier et accessibilité de la palette (option active, focus rendu, liste sans `listbox` vide). */
function setup(props: Partial<React.ComponentProps<typeof CommandPalette>> = {}) {
  const handlers = {
    onOpenChange: vi.fn(),
    onSearch: vi.fn(),
    onSelect: vi.fn(),
    onRetry: vi.fn(),
  };
  const view = render(<CommandPalette open status="ready" groups={[]} {...handlers} {...props} />);
  return { ...handlers, ...view };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => vi.useRealTimers());

const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("CommandPalette : lot D (clavier et accessibilité)", () => {
  const page = (id: string, title: string): CommandPaletteGroup => ({
    key: "pages",
    label: "Pages",
    items: [{ id, kind: "Page", title, href: `/${id}` }],
  });

  it("quand les résultats changent, la première option devient l'option active : Entrée ouvre celle-là, pas l'ancienne", async () => {
    const first = [page("idee", "Idée"), page("tickets", "Tickets")].flatMap(
      (group) => group.items,
    );
    const { rerender, onSelect, ...rest } = setup({
      status: "idle",
      groups: [{ key: "pages", label: "Pages", items: first }],
    });
    const u = user();
    await u.click(screen.getByRole("combobox"));
    expect(screen.getByRole("option", { name: /Idée/ })).toHaveAttribute("aria-selected", "true");
    rerender(
      <CommandPalette
        open
        status="ready"
        groups={[page("donnees", "Spec · Données")]}
        onOpenChange={rest.onOpenChange}
        onSearch={rest.onSearch}
        onSelect={onSelect}
        onRetry={rest.onRetry}
      />,
    );
    expect(screen.getByRole("option", { name: /Données/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await u.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]?.[0]).toMatchObject({ id: "donnees" });
  });

  it("aucun résultat ou erreur : pas de liste (role listbox) vide, le message est hors de la liste (aria-required-children)", () => {
    const { rerender, ...rest } = setup({ status: "error", groups: [] });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    rerender(
      <CommandPalette
        open
        status="ready"
        groups={[]}
        onOpenChange={rest.onOpenChange}
        onSearch={rest.onSearch}
        onSelect={rest.onSelect}
        onRetry={rest.onRetry}
      />,
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "zzz" } });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByText("Aucun résultat pour « zzz »")).toBeVisible();
  });

  it("onQueryChange suit chaque frappe tout de suite ; onSearch (serveur) attend 200 ms", async () => {
    const onQueryChange = vi.fn();
    const { onSearch } = setup({ onQueryChange, status: "idle", groups: [] });
    await user().type(screen.getByRole("combobox"), "don");
    expect(onQueryChange.mock.calls.map(([query]) => query)).toEqual(["d", "do", "don"]);
    expect(onSearch).not.toHaveBeenLastCalledWith("don");
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(onSearch).toHaveBeenLastCalledWith("don");
  });

  it("à la fermeture, le focus revient à l'élément qui l'avait avant l'ouverture", async () => {
    const handlers = {
      onOpenChange: vi.fn(),
      onSearch: vi.fn(),
      onSelect: vi.fn(),
      onRetry: vi.fn(),
    };
    const ui = (open: boolean) => (
      <>
        <input aria-label="Champ" />
        <CommandPalette open={open} status="idle" groups={[]} {...handlers} />
      </>
    );
    const { rerender } = render(ui(false));
    const field = screen.getByRole("textbox", { name: "Champ" });
    field.focus();
    rerender(ui(true));
    expect(await screen.findByRole("combobox")).toBeInTheDocument();
    rerender(ui(false));
    await act(() => vi.advanceTimersByTimeAsync(50));
    expect(field).toHaveFocus();
  });

  it("« Tapez pour rechercher. » disparaît dès qu'on a tapé, même avant la réponse du serveur", async () => {
    setup({ status: "idle", groups: [] });
    expect(screen.getByText("Tapez pour rechercher.")).toBeVisible();
    await user().type(screen.getByRole("combobox"), "ti");
    expect(screen.queryByText("Tapez pour rechercher.")).toBeNull();
  });
});
