// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ProposalReview,
  type ProposalReviewGroup,
  type ProposalReviewItem,
  type ProposalReviewProps,
} from "../src/index.ts";

/** TK-99b lot A, cas 8 et 9 (maquette 12 l.126-148 et 254-270 ; maquette 10 l.128) : relecture en volume, groupes au-delà de 30. */
function rows(prefix: string, count: number, from = 0): ProposalReviewItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}${from + i + 1}`,
    ref: `F-${prefix}${from + i + 1}`,
    title: `Proposition ${prefix}${from + i + 1}`,
    subtitle: "Fonctionnalité · 2 critères",
    status: "pending" as const,
  }));
}

function groups(): ProposalReviewGroup[] {
  return [
    {
      key: "feature:Réservation",
      label: "Fonctionnalités · Réservation",
      counts: { total: 42, accepted: 18, pending: 22 },
      matching: 22,
      items: rows("a", 8),
    },
    {
      key: "feature:Facturation",
      label: "Fonctionnalités · Facturation",
      counts: { total: 60, accepted: 0, pending: 60 },
      matching: 60,
      items: rows("b", 8),
    },
    {
      key: "criteria:Réservation",
      label: "Critères · Réservation",
      counts: { total: 3, accepted: 3, pending: 0 },
      matching: 0,
      items: [],
    },
  ];
}

function setup(overrides: Partial<ProposalReviewProps> = {}) {
  const props: ProposalReviewProps = {
    counts: { total: 105, accepted: 21, rejected: 0, pending: 84 },
    groups: groups(),
    filter: "pending",
    onFilterChange: vi.fn(),
    selectedId: "a1",
    onSelect: vi.fn(),
    onDecide: vi.fn(),
    onAcceptGroup: vi.fn(),
    onLoadMore: vi.fn(),
    onSave: vi.fn(),
    onLeave: vi.fn(),
    ...overrides,
  };
  render(
    <ProposalReview {...props}>
      <p>Détail</p>
    </ProposalReview>,
  );
  return props;
}

const header = (name: RegExp) => screen.getByRole("button", { name, expanded: true });

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("ProposalReview en volume : groupes, filtres, accepter le groupe", () => {
  it("filtres « À relire » (par défaut) et « Toutes » avec leurs comptes, aria-pressed", async () => {
    const props = setup();
    const pending = screen.getByRole("button", { name: /^À relire/ });
    expect(pending).toHaveAttribute("aria-pressed", "true");
    expect(pending).toHaveTextContent("À relire · 84");
    const all = screen.getByRole("button", { name: /^Toutes/ });
    expect(all).toHaveAttribute("aria-pressed", "false");
    expect(all).toHaveTextContent("Toutes · 105");
    expect(screen.getByText("Groupé par type puis par zone")).toBeInTheDocument();
    await userEvent.setup().click(all);
    expect(props.onFilterChange).toHaveBeenCalledWith("all");
  });

  it("en-têtes de groupe repliables : aria-expanded, sous-ligne « 42 · 18 acceptées · 22 à relire », collants", async () => {
    setup();
    const head = header(/Fonctionnalités · Réservation/);
    expect(head.closest("li")).toHaveClass("sticky", "top-0");
    expect(screen.getByText("42 · 18 acceptées · 22 à relire")).toBeVisible();
    const user = userEvent.setup();
    expect(screen.getByText("Proposition a1")).toBeVisible();
    await user.click(head);
    expect(head).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Proposition a1")).toBeNull();
    await user.click(head);
    expect(screen.getByText("Proposition a1")).toBeVisible();
  });

  it("8 éléments, puis « Afficher 20 de plus · N restantes dans ce groupe »", async () => {
    const props = setup();
    const more = screen.getByRole("button", {
      name: "Afficher 20 de plus · 52 restantes dans ce groupe",
    });
    await userEvent.setup().click(more);
    expect(props.onLoadMore).toHaveBeenCalledWith("feature:Facturation");
    expect(
      screen.getByRole("button", { name: "Afficher 14 de plus · 14 restantes dans ce groupe" }),
    ).toBeVisible();
  });

  it("« Accepter les N restantes » par groupe, nommé avec le groupe, absent quand rien n'est à relire", async () => {
    const props = setup();
    const accept = screen.getByRole("button", {
      name: "Accepter les 22 restantes de Fonctionnalités · Réservation",
    });
    expect(accept).toHaveTextContent("Accepter les 22 restantes");
    await userEvent.setup().click(accept);
    expect(props.onAcceptGroup).toHaveBeenCalledWith("feature:Réservation");
    expect(screen.queryByRole("button", { name: /Critères · Réservation.*restantes/ })).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Accepter les \d+ restantes/ })).toHaveLength(2);
  });

  it("jamais d'acceptation de toute la relecture", () => {
    setup();
    expect(
      screen.queryByRole("button", { name: /Tout accepter|Accepter tout|Accepter les 84/ }),
    ).toBeNull();
  });

  it("aria-setsize = total du groupe selon le filtre, aria-posinset = rang dans le groupe", () => {
    setup();
    const first = screen.getByText("Proposition b3").closest("li") as HTMLElement;
    expect(first).toHaveAttribute("aria-setsize", "60");
    expect(first).toHaveAttribute("aria-posinset", "3");
  });

  it("J à la fin d'un groupe passe au premier élément du groupe suivant, K revient ; un groupe replié est sauté", async () => {
    const props = setup({ selectedId: "a8" });
    const user = userEvent.setup();
    screen.getByText("Proposition a8").closest("button")?.focus();
    await user.keyboard("j");
    expect(props.onSelect).toHaveBeenLastCalledWith("b1");
    await user.click(header(/Fonctionnalités · Facturation/));
    (screen.getByText("Proposition a8").closest("button") as HTMLElement).focus();
    (props.onSelect as ReturnType<typeof vi.fn>).mockClear();
    await user.keyboard("j");
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it("K au début du groupe suivant revient au dernier élément du groupe précédent", async () => {
    const props = setup({ selectedId: "b1" });
    (screen.getByText("Proposition b1").closest("button") as HTMLElement).focus();
    await userEvent.setup().keyboard("k");
    expect(props.onSelect).toHaveBeenLastCalledWith("a8");
  });
});

describe("ProposalReview en volume : liste virtualisée", () => {
  it("un groupe de 400 éléments chargés ne met qu'une fenêtre dans le DOM", () => {
    const big: ProposalReviewGroup[] = [
      {
        key: "feature:Réservation",
        label: "Fonctionnalités · Réservation",
        counts: { total: 400, accepted: 0, pending: 400 },
        matching: 400,
        items: rows("c", 400),
      },
    ];
    setup({
      groups: big,
      counts: { total: 400, accepted: 0, rejected: 0, pending: 400 },
      selectedId: "c1",
    });
    const list = screen
      .getAllByRole("list")
      .find((l) => l.getAttribute("aria-label")?.includes("Réservation"));
    const rendered = within(list as HTMLElement).getAllByRole("listitem");
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.length).toBeLessThan(60);
    expect(rendered[0]).toHaveAttribute("aria-setsize", "400");
  });
});
