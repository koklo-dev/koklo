// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ActivityFeed,
  Button,
  DeliverableStatus,
  IconTile,
  ListPanel,
  ListRow,
  PageStatus,
  Pill,
  StatCard,
  TicketStatus,
} from "../src/index.ts";

/** TK-92 correction 2 (B296) : variantes de la planche 07, la valeur par défaut ne bouge pas. */
const filled = (el: Element | null) => el?.querySelector("path")?.getAttribute("d");

describe("StatCard density", () => {
  it("comfortable : marges 16 / 18, écart 8, valeur 26, note 13 ; compact par défaut inchangé", () => {
    const { container, rerender } = render(
      <StatCard density="comfortable" label="L" value="5" note="n" />,
    );
    let root = container.querySelector("[data-slot=stat-card]");
    expect(root).toHaveClass("gap-2");
    expect(root).not.toHaveClass("py-3.5");
    expect(screen.getByText("5")).toHaveClass("text-[26px]", "leading-[1.1]");
    expect(screen.getByText("n")).toHaveClass("text-meta");
    rerender(<StatCard label="L" value="5" note="n" />);
    root = container.querySelector("[data-slot=stat-card]");
    expect(root).toHaveClass("gap-1", "px-4", "py-3.5");
    expect(screen.getByText("n")).toHaveClass("text-caption");
  });
});

describe("ListPanel density", () => {
  it("comfortable : en-tête 14 20 avec ligne, lignes 12 20 écart 14, titres non coupés, pied 10 20", () => {
    const { container } = render(
      <ListPanel title="T" footer="pied" density="comfortable" viewAll={{ href: "/x" }}>
        <ListRow title="Un titre long" subtitle="sous" />
      </ListPanel>,
    );
    expect(container.querySelector("h2")?.parentElement).toHaveClass("border-b", "px-5", "py-3.5");
    expect(screen.getByRole("listitem")).toHaveClass("px-5", "gap-3.5");
    expect(screen.getByText("Un titre long")).not.toHaveClass("truncate");
    expect(screen.getByText("sous")).not.toHaveClass("truncate");
    expect(screen.getByText("pied")).toHaveClass("px-5", "py-2.5");
  });

  it("compact (défaut) : titres coupés, marges 16", () => {
    render(
      <ListPanel title="T">
        <ListRow title="Un titre" subtitle="sous" />
      </ListPanel>,
    );
    expect(screen.getByRole("listitem")).toHaveClass("px-4", "gap-3");
    expect(screen.getByText("Un titre")).toHaveClass("truncate");
  });
});

describe("icônes au contour", () => {
  it("IconTile fill={false} et Pill iconFill={false} dessinent l'icône au contour, pleine par défaut", () => {
    const tile = render(<IconTile icon="check_circle" fill={false} />).container;
    const tileFull = render(<IconTile icon="check_circle" />).container;
    const pill = render(
      <Pill icon="edit" iconFill={false}>
        x
      </Pill>,
    ).container;
    const pillFull = render(<Pill icon="edit">x</Pill>).container;
    expect(filled(tile)).not.toBe(filled(tileFull));
    expect(filled(pill)).not.toBe(filled(pillFull));
  });

  it("statuts neutres au contour, les autres pleins (TicketStatus, DeliverableStatus, PageStatus status)", () => {
    const neutral = [
      render(<TicketStatus status="todo" />).container,
      render(<DeliverableStatus status="in_progress" />).container,
      render(<PageStatus status="draft" pill="status" />).container,
    ];
    const full = [
      render(<TicketStatus status="done" />).container,
      render(<DeliverableStatus status="validated" />).container,
      render(<PageStatus status="stable" pill="status" />).container,
    ];
    for (const [i, el] of neutral.entries()) expect(filled(el)).not.toBe(filled(full[i] ?? null));
  });

  it("PageStatus status : marge gauche 6 (pl-1.5), pas le pl-2 de la pastille du document", () => {
    const { container } = render(<PageStatus status="review" pill="status" />);
    expect(container.querySelector("[data-slot=pill]")).not.toHaveClass("pl-2");
    const doc = render(<PageStatus status="review" pill />).container;
    expect(doc.querySelector("[data-slot=pill]")).toHaveClass("pl-2");
  });
});

describe("initiales d'avatar et bouton compact", () => {
  it("ActivityFeed : initiales 11/600", () => {
    render(
      <ActivityFeed items={[{ actor: { kind: "team", initials: "AK" }, text: "t", when: "w" }]} />,
    );
    expect(screen.getByText("AK")).toHaveClass("text-[11px]", "font-semibold");
  });

  it("Button compact : 30 de haut, marges 10, 13", () => {
    render(<Button size="compact">Voir</Button>);
    expect(screen.getByRole("button")).toHaveClass("h-[30px]", "px-2.5", "text-meta");
  });
});
