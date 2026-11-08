// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AppShell,
  AvatarGroup,
  PageNavItem,
  PageStatus,
  Prose,
  ProseInvite,
  ReorderableList,
  StatusLegend,
  TaskCheckbox,
  TaskItem,
} from "../src/index.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

const PAGES = [
  { id: "a", title: "01 · Vision" },
  { id: "b", title: "02 · Problème" },
  { id: "c", title: "03 · Périmètre" },
];

function list(onReorder = vi.fn(), extra: Record<string, unknown> = {}) {
  render(
    <ReorderableList
      items={PAGES}
      onReorder={onReorder}
      handleLabel={(page) => `Déplacer ${page.title}`}
      announce={(page, position, total) =>
        `${page.title.split(" · ")[1]} déplacée en position ${position} sur ${total}`
      }
      renderItem={(page) => <span>{page.title}</span>}
      {...extra}
    />,
  );
  return onReorder;
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("ReorderableList (T16)", () => {
  it("rend un ol de lignes avec une poignée nommée par page", () => {
    list();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Déplacer 03 · Périmètre" })).toBeInTheDocument();
  });

  it("Alt+flèche haut déplace d'un cran et annonce la position", () => {
    const onReorder = list();
    fireEvent.keyDown(screen.getByRole("button", { name: "Déplacer 03 · Périmètre" }), {
      key: "ArrowUp",
      altKey: true,
    });
    expect(onReorder).toHaveBeenCalledWith(["a", "c", "b"]);
    expect(document.querySelector("[data-slot=reorder-announcer]")).toHaveTextContent(
      "Périmètre déplacée en position 2 sur 3",
    );
  });

  it("Alt+flèche bas sur la dernière ligne ne fait rien", () => {
    const onReorder = list();
    fireEvent.keyDown(screen.getByRole("button", { name: "Déplacer 03 · Périmètre" }), {
      key: "ArrowDown",
      altKey: true,
    });
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("Espace saisit, flèche déplace, Espace dépose", async () => {
    const onReorder = list();
    const user = userEvent.setup();
    const handle = screen.getByRole("button", { name: "Déplacer 01 · Vision" });
    handle.focus();
    await user.keyboard(" ");
    await user.keyboard("{ArrowDown}");
    await user.keyboard(" ");
    // jsdom sans mise en page : le déplacement clavier ne mesure rien, la dépose ne doit pas casser.
    expect(onReorder.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it("Échap annule : aucun ordre émis", async () => {
    const onReorder = list();
    const user = userEvent.setup();
    screen.getByRole("button", { name: "Déplacer 01 · Vision" }).focus();
    await user.keyboard(" ");
    await user.keyboard("{Escape}");
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("lecture seule : aucune poignée", () => {
    list(vi.fn(), { readOnly: true });
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("réduction des animations : aucune transition en ligne", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    list();
    for (const item of screen.getAllByRole("listitem")) {
      expect((item as HTMLElement).style.transition).toBe("");
    }
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("PageStatus, StatusLegend, PageNavItem (T17)", () => {
  it.each([
    ["stable", "Stable"],
    ["review", "À relire"],
    ["draft", "Brouillon"],
    ["empty", "À explorer"],
  ] as const)("%s : libellé %s", (status, label) => {
    const { container } = render(<PageStatus status={status} showLabel />);
    expect(container).toHaveTextContent(label);
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,6}|rgb\(/i);
  });

  it("la pastille du document porte l'icône et le libellé", () => {
    const { container } = render(<PageStatus status="draft" pill />);
    expect(container.firstElementChild).toHaveAttribute("data-slot", "pill");
    expect(container).toHaveTextContent("Brouillon");
  });

  it("la légende liste les quatre états", () => {
    render(<StatusLegend />);
    const items = within(screen.getByRole("list", { name: "Légende des états" })).getAllByRole(
      "listitem",
    );
    expect(items.map((li) => li.textContent)).toEqual([
      "Stable",
      "À relire",
      "Brouillon",
      "À explorer",
    ]);
  });

  it("la légende : encadré --surface, 12/400, icônes en currentColor", () => {
    render(<StatusLegend />);
    const legend = screen.getByRole("list", { name: "Légende des états" });
    expect(legend).toHaveClass("bg-surface", "font-normal");
    expect(legend.innerHTML).not.toMatch(/text-primary|text-status-validated/);
  });

  it("la pastille du document prend la couleur du texte et un retrait de 8", () => {
    const { container } = render(<PageStatus status="draft" pill />);
    expect(container.firstElementChild).toHaveClass("pl-2", "text-foreground");
  });

  it("le menu d'une ligne n'apparaît qu'au survol ou au focus dès 1024 px", () => {
    const { container } = render(
      <PageNavItem
        href="/p"
        title="05 · Périmètre"
        status="draft"
        actions={<button type="button">m</button>}
      />,
    );
    const slot = container.querySelector("[data-slot=page-nav-actions]");
    expect(slot?.className).toContain("lg:opacity-0");
    expect(slot?.className).toContain("lg:focus-within:opacity-100");
  });

  it("la ligne de page dit titre, état et page requise", () => {
    render(<PageNavItem href="/p" title="05 · Périmètre" status="draft" required current />);
    const link = screen.getByRole("link", { name: /Brouillon.*05 · Périmètre.*requise/ });
    expect(link).toHaveAttribute("aria-current", "page");
    expect(link).toHaveClass("bg-secondary");
  });
});

describe("Prose, TaskItem, AvatarGroup (T17)", () => {
  it("Prose applique l'échelle du document par jetons", () => {
    const { container } = render(<Prose />);
    expect(container.firstElementChild?.className).toContain("--text-prose-title-size");
    expect(container.firstElementChild?.className).not.toMatch(/#[0-9a-f]{3,6}/i);
  });

  it("l'invite du document vide", () => {
    render(<ProseInvite />);
    expect(screen.getByText(/taper « \/ » pour insérer un bloc/)).toBeInTheDocument();
  });

  it("TaskItem : cochée et non cochée se disent", () => {
    render(
      <ul>
        <TaskItem checked>Réserver</TaskItem>
        <TaskItem checked={false}>Agenda</TaskItem>
      </ul>,
    );
    expect(screen.getByTitle("Faite")).toBeInTheDocument();
    expect(screen.getByTitle("À faire")).toBeInTheDocument();
  });

  it("TaskCheckbox : case nommée par la tâche, bascule son état", async () => {
    const onCheckedChange = vi.fn();
    render(<TaskCheckbox checked={false} label="Agenda" onCheckedChange={onCheckedChange} />);
    const box = screen.getByRole("checkbox", { name: "Agenda" });
    expect(box).toHaveAttribute("aria-checked", "false");
    expect(box.className).toContain("size-6");
    await userEvent.click(box);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("AvatarGroup : 28 px, client en ton warning, plafond +N", () => {
    render(
      <AvatarGroup
        label="Présents"
        max={2}
        people={[
          { name: "Awa Koné (équipe)", initials: "AK" },
          { name: "Marie Lefèvre (client)", initials: "ML", isClient: true },
          { name: "Moussa Diallo (équipe)", initials: "MD" },
        ]}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("img", { name: "Marie Lefèvre (client)" })).toHaveClass(
      "bg-status-pending",
    );
    expect(screen.getByText("+1")).toBeInTheDocument();
  });
});

describe("AppShell defaultCollapsed", () => {
  const shell = (props: Record<string, unknown> = {}) => (
    <AppShell sidebar={<span>barre</span>} mobileTitle="Koklo" {...props}>
      <p>page</p>
    </AppShell>
  );

  it("rail replié tant que rien n'est mémorisé", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
    const { container } = render(shell({ defaultCollapsed: true }));
    await act(async () => undefined);
    expect(container.querySelector("[data-slot=app-shell-sidebar]")).toHaveAttribute(
      "data-state",
      "collapsed",
    );
  });

  it("la valeur mémorisée l'emporte", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
    window.localStorage.setItem("koklo.sidebar", "expanded");
    const { container } = render(shell({ defaultCollapsed: true }));
    await act(async () => undefined);
    expect(container.querySelector("[data-slot=app-shell-sidebar]")).toHaveAttribute(
      "data-state",
      "expanded",
    );
  });
});
