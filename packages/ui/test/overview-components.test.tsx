// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  ActivityFeed,
  DeliverableCard,
  DeliverableStatus,
  MaturityMeter,
  NextStep,
  PageStatus,
  PersonRow,
  SegmentedGauge,
  StatCard,
  TicketStatus,
} from "../src/index.ts";

/** TK-92 : composants de la vue d'ensemble (DESIGN.md §5.11, maquette 07 l.103-191). */
describe("SegmentedGauge", () => {
  it("dessine un cran par unité jusqu'à 12 et marque les atteints", () => {
    const { container } = render(<SegmentedGauge done={4} total={7} />);
    const cells = container.querySelector("[data-slot=segmented-gauge]")?.children ?? [];
    expect(cells).toHaveLength(7);
    expect([...cells].filter((c) => c.getAttribute("data-reached") === "true")).toHaveLength(4);
    expect(cells[0]).toHaveClass("flex-1", "h-1.5", "rounded-[2px]", "bg-primary");
    expect(cells[6]).toHaveClass("bg-border-strong");
  });

  it("plafonne à 12 crans et garde la proportion", () => {
    const { container } = render(<SegmentedGauge done={50} total={100} />);
    const cells = container.querySelector("[data-slot=segmented-gauge]")?.children ?? [];
    expect(cells).toHaveLength(12);
    expect([...cells].filter((c) => c.getAttribute("data-reached") === "true")).toHaveLength(6);
  });

  it("est décorative (aria-hidden), hauteur 5 et ton validé", () => {
    const { container } = render(<SegmentedGauge done={2} total={2} height={5} tone="validated" />);
    const gauge = container.querySelector("[data-slot=segmented-gauge]");
    expect(gauge).toHaveAttribute("aria-hidden", "true");
    expect(gauge?.children[0]).toHaveClass("h-[5px]", "bg-status-validated-foreground");
  });

  it("ne dessine aucun cran pour un total nul, sans erreur", () => {
    const { container } = render(<SegmentedGauge done={0} total={0} />);
    expect(container.querySelector("[data-slot=segmented-gauge]")?.children).toHaveLength(0);
  });

  it("MaturityMeter garde ses crans de 10 × 6 sans plafond, sur cette variante", () => {
    render(<MaturityMeter stable={2} total={14} />);
    const meter = screen.getByRole("meter");
    expect(meter.children).toHaveLength(14);
    expect(meter).toHaveAttribute("data-slot", "segmented-gauge");
    expect(meter).not.toHaveAttribute("aria-hidden");
    expect(meter.children[0]).toHaveClass("w-2.5", "h-1.5");
  });
});

describe("NextStep", () => {
  it("est une note nommée avec surtitre, titre, phrase et un lien d'action", () => {
    render(
      <NextStep
        title="Marie doit valider"
        body="Depuis 3 jours."
        action={{ label: "Ouvrir", href: "/x" }}
      />,
    );
    const note = screen.getByRole("note", { name: "Prochaine étape" });
    expect(note).toHaveAttribute("data-tone", "warning");
    expect(within(note).getByText("Prochaine étape")).toBeInTheDocument();
    expect(within(note).getByRole("link", { name: "Ouvrir" })).toHaveAttribute("href", "/x");
    expect(note).toHaveClass("bg-alert-warning", "border-alert-warning-border");
  });

  it("appelle onClick pour une action bouton", () => {
    const onClick = vi.fn();
    render(<NextStep title="t" action={{ label: "Relancer Marie", onClick }} />);
    screen.getByRole("button", { name: "Relancer Marie" }).click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("ton neutre sans action : ni lien ni bouton", () => {
    render(<NextStep tone="neutral" title="Rien n'attend d'action." />);
    const note = screen.getByRole("note");
    expect(note).toHaveClass("bg-alert-neutral");
    expect(within(note).queryByRole("link")).toBeNull();
    expect(within(note).queryByRole("button")).toBeNull();
  });
});

describe("DeliverableStatus revise", () => {
  it("affiche « À revoir » avec le ton de révision", () => {
    render(<DeliverableStatus status="revise" />);
    const status = screen.getByText("À revoir").parentElement;
    expect(status).toHaveAttribute("data-status", "revise");
    expect(status).toHaveClass("bg-status-revise", "text-status-revise-foreground");
  });
});

const BASE = {
  icon: "task_alt" as const,
  title: "Cahier fonctionnel",
  content: "7 fonctionnalités",
  status: "pending" as const,
  gauge: { done: 4, total: 7 },
  progress: "4 fonctionnalités validées sur 7",
  validator: { kind: "client" as const, label: "Validation client · obligatoire" },
};

describe("DeliverableCard", () => {
  it("livrée : un seul lien, au nom accessible complet", () => {
    render(<DeliverableCard {...BASE} href="/projects/p/spec/functional" />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName(
      /^Cahier fonctionnel\s*À valider\s*7 fonctionnalités\s*4 fonctionnalités validées sur 7\s*Validation client · obligatoire$/,
    );
    expect(links[0]).toHaveAttribute("href", "/projects/p/spec/functional");
    expect(screen.getByText("Validation client · obligatoire")).toHaveClass("font-semibold");
  });

  it("livrée sans href (rôle sans accès à l'écran) : aucun lien, jauge conservée", () => {
    const { container } = render(<DeliverableCard {...BASE} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("4 fonctionnalités validées sur 7")).toBeInTheDocument();
    expect(container.querySelector("[data-slot=segmented-gauge]")).not.toBeNull();
  });

  it("variante soon : aucun lien, « À faire », sans jauge", () => {
    const { container } = render(
      <DeliverableCard
        {...BASE}
        soon
        status="todo"
        content="Bientôt disponible"
        progress="À faire"
        validator={{ kind: "team", label: "Validation de l'équipe" }}
      />,
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Bientôt disponible")).toBeInTheDocument();
    expect(container.querySelector("[data-slot=segmented-gauge]")).toBeNull();
    expect(container.querySelector("[data-slot=deliverable-status]")).toHaveAttribute(
      "data-status",
      "todo",
    );
  });

  it("validé : jauge en ton validé", () => {
    const { container } = render(<DeliverableCard {...BASE} status="validated" href="/x" />);
    expect(container.querySelector("[data-slot=segmented-gauge]")?.children[0]).toHaveClass(
      "bg-status-validated-foreground",
    );
  });
});

describe("ActivityFeed et PersonRow", () => {
  it("liste les phrases avec avatar décoratif et date, tons par acteur", () => {
    const { container } = render(
      <ActivityFeed
        items={[
          { actor: { kind: "client", initials: "ML" }, text: "Marie a validé F-001", when: "hier" },
          { actor: { kind: "agent", initials: "IA" }, text: "L'agent a proposé", when: "2 h" },
          { actor: { kind: "team", initials: "AK" }, text: "Awa a relu", when: "3 nov." },
        ]}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("Marie a validé F-001")).toBeInTheDocument();
    expect(screen.getByText("hier")).toHaveClass("text-muted-foreground");
    const tones = [...container.querySelectorAll("[data-tone]")].map((n) =>
      n.getAttribute("data-tone"),
    );
    expect(tones).toEqual(["warning", "agent", "soft"]);
    expect(container.querySelector("[data-size='32']")).toHaveAttribute("aria-hidden", "true");
  });

  it("PersonRow : nom, rôle, initiales décoratives", () => {
    const { container } = render(
      <PersonRow name="Marie Lefèvre" initials="ML" roleLabel="Client" kind="client" />,
    );
    expect(screen.getByText("Marie Lefèvre")).toHaveClass("font-medium");
    expect(screen.getByText("Client")).toHaveClass("text-muted-foreground");
    expect(container.querySelector("[data-tone='warning']")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("TicketStatus", () => {
  it.each([
    ["in_review", "En revue", "warning"],
    ["in_progress", "En cours", "neutral"],
    ["done", "Terminé", "success"],
    ["todo", "À faire", "neutral"],
  ] as const)("%s : « %s » en ton %s", (status, label, tone) => {
    render(<TicketStatus status={status} />);
    const pill = screen.getByText(label);
    expect(pill).toHaveAttribute("data-tone", tone);
    expect(pill).toHaveAttribute("data-size", "md");
  });
});

describe("StatCard à crans et PageStatus pastille d'état", () => {
  it("StatCard segments : jauge à crans décorative, valeur écrite à côté", () => {
    const { container } = render(
      <StatCard
        label="Maturité du dossier"
        value="5 sur 10"
        segments={{ done: 5, total: 10 }}
        note="pages stables"
      />,
    );
    const gauge = container.querySelector("[data-slot=segmented-gauge]");
    expect(gauge).toHaveAttribute("aria-hidden", "true");
    expect(gauge?.children).toHaveLength(10);
    expect(screen.getByText("5 sur 10")).toBeInTheDocument();
    expect(container.querySelector("[role=progressbar]")).toBeNull();
  });

  it('PageStatus pill="status" : stable en ton succès, les autres en ton doux', () => {
    render(
      <>
        <PageStatus status="stable" pill="status" />
        <PageStatus status="review" pill="status" />
      </>,
    );
    expect(screen.getByText("Stable")).toHaveAttribute("data-tone", "success");
    expect(screen.getByText("À relire")).toHaveAttribute("data-tone", "soft");
  });
});
