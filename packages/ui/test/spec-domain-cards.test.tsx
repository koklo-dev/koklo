// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  FlowCard,
  Icon,
  type MatrixAction,
  PermissionMatrix,
  RoleCard,
  RuleCard,
  RuleTypeLegend,
  WorkflowStates,
} from "../src/index.ts";

/**
 * TK-103 lot B (DESIGN.md §5.16, maquette 10 l.225-295) : `RuleCard`, `WorkflowStates`, `RoleCard`,
 * `PermissionMatrix`, `FlowCard` (avec `FlowSteps` et `FlowError`).
 */
describe("WorkflowStates", () => {
  it("rend les états dans une liste lue dans l'ordre, le premier est l'état initial", () => {
    const { container } = render(<WorkflowStates states={["Confirmée", "Honorée", "Annulée"]} />);
    const list = screen.getByRole("list", { name: "États de la règle" });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(["Confirmée", "Honorée", "Annulée"]);
    expect(container.querySelector("[data-initial]")).toHaveTextContent("Confirmée");
    expect(container.querySelector("[data-initial]")?.className).toMatch(/bg-primary/);
    expect(container.querySelectorAll("[data-initial]")).toHaveLength(1);
  });

  it("la flèche entre l'état initial et les suivants est décorative", () => {
    const { container } = render(<WorkflowStates states={["A", "B"]} />);
    expect(container.querySelector("svg[aria-hidden='true']")).not.toBeNull();
  });
});

describe("RuleCard", () => {
  const base = {
    id: "R-002",
    title: "Délai d'annulation",
    type: "contrainte" as const,
    statement: "Une réservation ne peut être annulée qu'à plus de 2 h.",
  };

  it("affiche identifiant, titre, type, énoncé, exemple et fonctionnalités", () => {
    render(
      <RuleCard
        {...base}
        example="Rendez-vous à 14 h : jusqu'à 12 h."
        features={["F-002", "F-006"]}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 3, name: "Délai d'annulation" }),
    ).toBeInTheDocument();
    expect(screen.getByText("R-002")).toBeInTheDocument();
    expect(screen.getByText("Contrainte")).toBeInTheDocument();
    expect(screen.getByText(base.statement)).toBeInTheDocument();
    expect(screen.getByText("Exemple")).toBeInTheDocument();
    expect(screen.getByText(/Appliquée par/)).toBeInTheDocument();
    expect(screen.getByText("F-006")).toBeInTheDocument();
  });

  it("ne montre les états que pour un workflow", () => {
    const { rerender } = render(<RuleCard {...base} states={["A", "B"]} />);
    expect(screen.queryByRole("list", { name: "États de la règle" })).toBeNull();
    rerender(<RuleCard {...base} type="workflow" states={["A", "B"]} />);
    expect(screen.getByRole("list", { name: "États de la règle" })).toBeInTheDocument();
    expect(screen.getByText("Workflow à états")).toBeInTheDocument();
  });

  it("le bouton « Modifier R-002 » n'existe que pour l'équipe qui écrit", () => {
    const onEdit = vi.fn();
    const { rerender } = render(<RuleCard {...base} />);
    expect(screen.queryByRole("button", { name: "Modifier R-002" })).toBeNull();
    rerender(<RuleCard {...base} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole("button", { name: "Modifier R-002" }));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it("la carte choisie a la bordure primaire et aria-current", () => {
    const { container } = render(<RuleCard {...base} selected />);
    const card = container.querySelector("[data-slot='rule-card']") as HTMLElement;
    expect(card.className).toMatch(/border-primary/);
    expect(card).toHaveAttribute("aria-current", "true");
  });
});

describe("RoleCard", () => {
  it("affiche nom, identifiant mono et description ; la tuile est décorative", () => {
    const { container } = render(
      <RoleCard
        id="RL-accueil"
        name="Accueil"
        description="Gère l'agenda."
        index={1}
        onEdit={() => undefined}
      />,
    );
    expect(screen.getByRole("heading", { level: 3, name: "Accueil" })).toBeInTheDocument();
    expect(screen.getByText("RL-accueil").className).toMatch(/font-mono/);
    expect(screen.getByText("Gère l'agenda.")).toBeInTheDocument();
    expect(container.querySelector("[data-slot='icon-tile']")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(screen.getByRole("button", { name: "Modifier RL-accueil" })).toBeInTheDocument();
  });

  it("les teintes des tuiles tournent : ambre, violet, vert", () => {
    const { container } = render(
      <div>
        {[0, 1, 2, 3].map((index) => (
          <RoleCard key={index} id={`RL-r${index}`} name={`R${index}`} index={index} />
        ))}
      </div>,
    );
    const tones = [...container.querySelectorAll("[data-slot='icon-tile']")].map((tile) =>
      tile.getAttribute("data-tone"),
    );
    expect(tones).toEqual(["warning", "soft", "success", "warning"]);
  });
});

const ROLES = [
  { id: "RL-client", name: "Client" },
  { id: "RL-gerant", name: "Gérant" },
];
const action = (
  id: string,
  resource: string,
  level: "allowed" | "restricted" | "denied",
  restriction?: string,
): MatrixAction => ({
  id,
  label: `Libellé ${id}`,
  resource,
  access: [{ level, restriction }, { level: "allowed" }],
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("PermissionMatrix", () => {
  const noop = () => undefined;

  it("est un vrai tableau nommé avec en-têtes de colonne et de ligne", () => {
    render(
      <PermissionMatrix
        roles={ROLES}
        actions={[action("PM-reservation.creer", "reservation", "denied")]}
        total={1}
        filter=""
        onFilterChange={noop}
      />,
    );
    const table = screen.getByRole("table", { name: "Qui peut faire quoi" });
    expect(table.querySelector("caption")).toHaveTextContent("Qui peut faire quoi");
    const columns = [...table.querySelectorAll("th[scope='col']")].map((th) => th.textContent);
    expect(columns).toEqual(["Action", "Client", "Gérant"]);
    expect(table.querySelector("th[scope='row']")).toHaveTextContent("PM-reservation.creer");
    expect(table.querySelector("[scope='rowgroup']")).toBeNull();
  });

  it("dit l'accès en texte : autorisé, autorisé avec restriction, non autorisé", () => {
    render(
      <PermissionMatrix
        roles={ROLES}
        actions={[
          action("PM-a.lire", "a", "denied"),
          action("PM-a.modifier", "a", "restricted", "Les siennes"),
        ]}
        total={2}
        filter=""
        onFilterChange={noop}
      />,
    );
    expect(screen.getByText("non autorisé")).toBeInTheDocument();
    expect(screen.getByText("autorisé : les siennes")).toBeInTheDocument();
    expect(screen.getAllByText("autorisé")).toHaveLength(2);
  });

  it("le cadre défile au clavier : région focusable nommée, largeur minimale 640", () => {
    const { container } = render(
      <PermissionMatrix roles={ROLES} actions={[]} total={0} filter="" onFilterChange={noop} />,
    );
    const region = screen.getByRole("region", {
      name: "Qui peut faire quoi, défilement horizontal",
    });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(container.querySelector("table")?.className).toMatch(/min-w-\[640px\]/);
  });

  it("au-delà de 20 actions : lignes de groupe `rowgroup` à bouton `aria-expanded`", () => {
    const onToggle = vi.fn();
    render(
      <PermissionMatrix
        roles={ROLES}
        total={47}
        groups={[
          { resource: "Paiement", count: 12, open: false },
          { resource: "Agenda", count: 3, open: true },
        ]}
        actions={[action("PM-agenda.lire", "Agenda", "allowed")]}
        filter=""
        onFilterChange={noop}
        onToggleGroup={onToggle}
      />,
    );
    const closed = screen.getByRole("button", { name: /Paiement/ });
    expect(closed).toHaveAttribute("aria-expanded", "false");
    expect(closed.closest("th")).toHaveAttribute("scope", "rowgroup");
    expect(screen.getByRole("button", { name: /Agenda/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("PM-agenda.lire")).toBeInTheDocument();
    fireEvent.click(closed);
    expect(onToggle).toHaveBeenCalledWith("Paiement", true);
  });

  it("le filtre « Filtrer les actions » est dans la légende", () => {
    const onFilter = vi.fn();
    render(
      <PermissionMatrix roles={ROLES} actions={[]} total={0} filter="" onFilterChange={onFilter} />,
    );
    fireEvent.change(screen.getByRole("searchbox", { name: "Filtrer les actions" }), {
      target: { value: "agenda" },
    });
    expect(onFilter).toHaveBeenCalledWith("agenda");
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("FlowCard", () => {
  const steps = [
    { label: "Accueil du portail", screen: "S-accueil" },
    { label: "Choisir un service", screen: "S-services" },
    { label: "Confirmation" },
  ];

  it("rend les étapes dans un ol numéroté, flèches décoratives", () => {
    const { container } = render(
      <FlowCard
        id="P-reserver"
        title="Réserver"
        actor="Client"
        steps={steps}
        features={["F-001", "F-004"]}
      />,
    );
    const list = screen.getByRole("list", { name: "Étapes du parcours" });
    expect(list.tagName).toBe("OL");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Étape 1");
    expect(items[0]).toHaveTextContent("S-accueil");
    expect(items[2]).toHaveTextContent("Étape 3");
    const arrows = container.querySelectorAll("ol svg[aria-hidden='true']");
    expect(arrows.length).toBe(4);
    expect(screen.getByText("Fonctionnalités : F-001, F-004")).toBeInTheDocument();
    expect(screen.getByText("· Client")).toBeInTheDocument();
  });

  it("la liste passe en colonne sous 768 px (flex-col, flex-row en md)", () => {
    render(<FlowCard id="P-a" title="A" actor="Client" steps={steps} />);
    const list = screen.getByRole("list", { name: "Étapes du parcours" });
    expect(list.className).toMatch(/flex-col/);
    expect(list.className).toMatch(/md:flex-row/);
  });

  it("une ligne par cas d'erreur, « Étape n : » en gras, fond d'erreur", () => {
    const { container } = render(
      <FlowCard
        id="P-a"
        title="A"
        actor="Client"
        steps={steps}
        errors={[
          { step: 3, text: "créneau pris" },
          { step: 2, text: "téléphone invalide" },
        ]}
      />,
    );
    const errors = container.querySelectorAll("[data-slot='flow-error']");
    expect(errors).toHaveLength(2);
    expect(errors[0]).toHaveTextContent("Étape 3 : créneau pris");
    expect(errors[0]?.className).toMatch(/bg-alert-error/);
  });

  it("« Modifier P-a » seulement avec onEdit", () => {
    const onEdit = vi.fn();
    const { rerender } = render(<FlowCard id="P-a" title="A" actor="Client" steps={steps} />);
    expect(screen.queryByRole("button", { name: "Modifier P-a" })).toBeNull();
    rerender(<FlowCard id="P-a" title="A" actor="Client" steps={steps} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole("button", { name: "Modifier P-a" }));
    expect(onEdit).toHaveBeenCalledOnce();
  });
});

describe("RuleTypeLegend", () => {
  it("trois boutons aria-pressed ; le type actif est pressé et un second appui retire le filtre", () => {
    const onChange = vi.fn();
    render(<RuleTypeLegend value="calcul" onChange={onChange} />);
    const group = screen.getByRole("group", { name: "Filtrer par type de règle" });
    const buttons = within(group).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Contrainte",
      "Calcul",
      "Workflow à états",
    ]);
    expect(screen.getByRole("button", { name: "Calcul" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Contrainte" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    fireEvent.click(screen.getByRole("button", { name: "Contrainte" }));
    expect(onChange).toHaveBeenLastCalledWith("contrainte");
    fireEvent.click(screen.getByRole("button", { name: "Calcul" }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });
});

describe("TK-103 correction 1 : icônes au contour, en-tête de parcours", () => {
  const outline = async (name: "block" | "support_agent") => {
    const { container, unmount } = render(<Icon name={name} />);
    await waitFor(() => expect(container.querySelector("path")).not.toBeNull());
    const d = container.querySelector("path")?.getAttribute("d");
    unmount();
    return d;
  };
  it("la pastille de type d'une règle et la tuile d'un rôle sont au contour", async () => {
    const block = await outline("block");
    const agent = await outline("support_agent");
    const { container } = render(
      <>
        <RuleCard id="R-1" title="T" type="contrainte" statement="x" />
        <RoleCard id="RL-a" name="A" index={1} />
      </>,
    );
    await waitFor(() => expect(container.querySelectorAll("path")).toHaveLength(2));
    const paths = [...container.querySelectorAll("path")].map((node) => node.getAttribute("d"));
    expect(paths).toEqual(expect.arrayContaining([block, agent]));
  });
  it("l'acteur reste avec le titre, « Fonctionnalités » passe sur sa ligne sous 768 px", () => {
    render(
      <FlowCard
        id="P-a"
        title="A"
        actor="Client"
        steps={[]}
        features={["F-1"]}
        onEdit={() => {}}
      />,
    );
    const head = screen.getByText("· Client").parentElement as HTMLElement;
    expect(within(head).getByRole("heading", { name: "A" })).toBeInTheDocument();
    expect(screen.getByText(/Fonctionnalités : F-1/)).toHaveClass(
      "max-md:basis-full",
      "font-normal",
    );
  });
});
