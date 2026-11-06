// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";
import { EntityChip, HoverCard, Icon, type IconName } from "../src/index.ts";

/**
 * TK-87 CA2, cas 2.5 (passation 01 §0.3, DESIGN.md v2 §4 et §5.1, 02-design §2.3, questions.md B32) :
 * vrai lien, icône par type, identifiant mono, titre facultatif, nom accessible « <Type> <id> <titre> »,
 * aperçu `HoverCard` au survol et au focus sur `--raised`, fermé par Échap.
 */
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const KINDS = [
  { kind: "feature", id: "F-001", icon: "task_alt", type: "Fonctionnalité" },
  { kind: "screen", id: "S-login", icon: "web", type: "Écran" },
  { kind: "ticket", id: "TK-104", icon: "view_kanban", type: "Ticket" },
  { kind: "role", id: "RL-owner", icon: "person", type: "Rôle" },
  { kind: "table", id: "T-users", icon: "table", type: "Table" },
  { kind: "rule", id: "R-001", icon: "gavel", type: "Règle métier" },
  { kind: "endpoint", id: "E-auth-login", icon: "api", type: "Point d'accès" },
  { kind: "commit", id: "a1b2c3d", icon: "commit", type: "Commit" },
] as const;

async function pathIn(root: Element): Promise<string> {
  let d = "";
  await waitFor(() => {
    d = root.querySelector("svg path")?.getAttribute("d") ?? "";
    expect(d, "tracé SVG absent : icône non générée ou non rendue").not.toBe("");
  });
  return d;
}

async function iconPaths(name: IconName): Promise<string[]> {
  const out: string[] = [];
  for (const fill of [true, false]) {
    const { container, unmount } = render(<Icon name={name} size={16} fill={fill} />);
    out.push(await pathIn(container));
    unmount();
  }
  return out;
}

const PREVIEW = { title: "F-001 · Connexion par e-mail", summary: "3 critères · liée à S-login" };

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("EntityChip", () => {
  it.each(KINDS)(
    "$kind : vrai lien <a href>, nom accessible « $type $id »",
    ({ kind, id, type }) => {
      render(<EntityChip kind={kind} id={id} href={`#${id}`} />);
      const link = screen.getByRole("link", { name: `${type} ${id}` });
      expect(link.tagName).toBe("A");
      expect(link).toHaveAttribute("href", `#${id}`);
      expect(link).toHaveAttribute("data-slot", "entity-chip");
    },
  );

  it.each(KINDS)("$kind : icône $icon de 16 px, décorative", async ({ kind, id, icon }) => {
    const expected = await iconPaths(icon);
    render(<EntityChip kind={kind} id={id} href="#" />);
    const link = screen.getByRole("link");
    const svg = link.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("width", "16");
    expect(expected).toContain(await pathIn(link));
  });

  it("identifiant en police mono ; titre facultatif inclus dans le nom accessible", () => {
    render(<EntityChip kind="feature" id="F-001" title="Connexion" href="#F-001" />);
    const link = screen.getByRole("link", { name: "Fonctionnalité F-001 Connexion" });
    expect(screen.getByText("F-001")).toHaveClass("font-mono");
    expect(link).toHaveTextContent("Connexion");
  });

  it("le préfixe de type n'est lu que par les lecteurs d'écran", () => {
    render(<EntityChip kind="rule" id="R-001" href="#" />);
    expect(screen.getByText("Règle métier")).toHaveClass("sr-only");
  });

  it("jetons de la puce : fond --secondary, texte --secondary-foreground", () => {
    render(<EntityChip kind="screen" id="S-login" href="#" />);
    expect(screen.getByRole("link")).toHaveClass("bg-secondary", "text-secondary-foreground");
  });

  it("sans aperçu : aucun HoverCard au focus", async () => {
    render(<EntityChip kind="feature" id="F-001" href="#" />);
    await userEvent.tab();
    expect(screen.getByRole("link")).toHaveFocus();
    await new Promise((r) => setTimeout(r, 900));
    expect(screen.queryByText(PREVIEW.summary)).toBeNull();
  });

  it("avec aperçu : s'ouvre au focus clavier, titre et résumé, sur --raised", async () => {
    render(<EntityChip kind="feature" id="F-001" title="Connexion" href="#" preview={PREVIEW} />);
    await userEvent.tab();
    const summary = await screen.findByText(PREVIEW.summary, {}, { timeout: 3000 });
    expect(screen.getByText(PREVIEW.title)).toBeInTheDocument();
    const card = summary.closest("[data-slot='hover-card-content']");
    expect(card, "contenu HoverCard").not.toBeNull();
    expect(card?.className ?? "").toMatch(/\bbg-(?:raised|popover)\b/);
    expect(card).toHaveClass("shadow-floating");
  });

  it("avec aperçu : s'ouvre au survol et se ferme par Échap", async () => {
    render(<EntityChip kind="feature" id="F-001" href="#" preview={PREVIEW} />);
    const link = screen.getByRole("link");
    fireEvent.pointerEnter(link, { pointerType: "mouse" });
    fireEvent.pointerMove(link, { pointerType: "mouse" });
    await screen.findByText(PREVIEW.summary, {}, { timeout: 3000 });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText(PREVIEW.summary)).toBeNull());
  });

  it("refuse au type un type d'entité inconnu et un lien absent", () => {
    // @ts-expect-error union fermée des 8 types
    render(<EntityChip kind="bug" id="B-1" href="#" />);
    // @ts-expect-error href obligatoire : toujours un vrai lien
    render(<EntityChip kind="feature" id="F-001" />);
  });
});

describe("HoverCard (primitive)", () => {
  it("est exportée par @koklo/ui avec ses parties", async () => {
    const ui = await import("../src/index.ts");
    for (const name of ["HoverCard", "HoverCardTrigger", "HoverCardContent"]) {
      expect(ui, name).toHaveProperty(name);
    }
    expect(typeof HoverCard).toBe("function");
  });
});
