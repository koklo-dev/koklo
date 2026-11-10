// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  PhasePill,
  ProgressChecklist,
  ProjectCard,
  ProjectCardCreating,
  type ProjectCardProps,
  ProjectTile,
  ShellNavItem,
} from "../src/index.ts";

/** TK-93 lot B (DESIGN.md §5.12, maquette 08 l.97-119, 85-96, 196-199). */

describe("ProjectTile", () => {
  it.each([
    [22, "size-[22px]", "rounded-md"],
    [36, "size-9", "rounded-card"],
    [40, "size-10", "rounded-card"],
  ] as const)("taille %i : boîte, rayon, initiales décoratives", (size, box, radius) => {
    const { container } = render(<ProjectTile initials="PR" colorKey={1} size={size} />);
    const tile = container.firstElementChild as HTMLElement;
    expect(tile).toHaveClass(box, radius, "font-bold");
    expect(tile).toHaveAttribute("aria-hidden", "true");
    expect(tile).toHaveTextContent("PR");
  });

  it.each([1, 2, 3, 4, 5] as const)("teinte %i : jetons --hue-%i", (key) => {
    const { container } = render(<ProjectTile initials="AB" colorKey={key} size={40} />);
    expect(container.firstElementChild).toHaveClass(`bg-hue-${key}`, `text-hue-${key}-foreground`);
  });

  it("ton soft : --secondary au lieu de la teinte (carte de création, l.87)", () => {
    const { container } = render(<ProjectTile initials="AB" colorKey={3} size={36} tone="soft" />);
    expect(container.firstElementChild).toHaveClass("bg-secondary", "text-secondary-foreground");
    expect(container.firstElementChild).not.toHaveClass("bg-hue-3");
  });

  it("texte 10 en taille 22, 14 sinon", () => {
    const small = render(<ProjectTile initials="AB" colorKey={1} size={22} />);
    expect(small.container.firstElementChild).toHaveClass("text-[10px]");
    const big = render(<ProjectTile initials="AB" colorKey={1} size={40} />);
    expect(big.container.firstElementChild).toHaveClass("text-body");
  });
});

describe("PhasePill", () => {
  it.each([
    ["idea", "Idée · 1/4"],
    ["framing", "Cadrage · 2/4"],
    ["iterations", "Itérations · 4/4"],
  ] as const)("%s : libellé « %s » et 4 traits de 10 × 4", (phase, text) => {
    const { container } = render(<PhasePill phase={phase} />);
    expect(container.firstElementChild).toHaveTextContent(text);
    const bars = container.querySelectorAll("[data-bar]");
    expect(bars).toHaveLength(4);
    for (const bar of bars) expect(bar).toHaveClass("w-2.5", "h-1", "rounded-[2px]");
  });

  it("traits : faits primary, courant primary à 45 %, restants border-strong", () => {
    const { container } = render(<PhasePill phase="framing" />);
    const states = [...container.querySelectorAll("[data-bar]")].map((b) =>
      b.getAttribute("data-bar"),
    );
    expect(states).toEqual(["done", "current", "upcoming", "upcoming"]);
    const bars = container.querySelectorAll("[data-bar]");
    expect(bars[0]).toHaveClass("bg-primary");
    expect(bars[1]).toHaveClass("bg-primary/45");
    expect(bars[2]).toHaveClass("bg-border-strong");
  });

  it("pastille contour de 24 de haut, 12/500", () => {
    const { container } = render(<PhasePill phase="idea" />);
    expect(container.firstElementChild).toHaveClass(
      "h-6",
      "border",
      "border-border",
      "text-caption",
    );
  });
});

describe("ProgressChecklist", () => {
  const items = [
    { key: "project", label: "Projet créé", status: "done" },
    { key: "idea", label: "Dossier d'idée prêt (10 pages)", status: "done" },
    { key: "repo", label: "Création du dépôt de spec sur GitHub…", status: "running" },
    { key: "invitation", label: "Invitation du client", status: "todo" },
    { key: "bad", label: "Dépôt de spec", status: "error", detail: "Ce nom est déjà pris." },
  ] as const;

  it("une ligne par étape, état écrit en texte caché (jamais la couleur seule)", () => {
    render(<ProgressChecklist items={items} />);
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveTextContent("Projet créé");
    expect(rows[0]).toHaveTextContent("terminé");
    expect(rows[2]).toHaveTextContent("en cours");
    expect(rows[3]).toHaveTextContent("à faire");
    expect(rows[4]).toHaveTextContent("en échec");
  });

  it("icônes : validé plein vert, spinner pour l'étape en cours, destructive en échec", () => {
    const { container } = render(<ProgressChecklist items={items} />);
    expect(container.querySelectorAll("[data-slot='spinner']")).toHaveLength(1);
    expect(screen.getAllByRole("listitem")[0]?.querySelector("svg")).toHaveClass(
      "text-status-validated-foreground",
    );
    expect(screen.getAllByRole("listitem")[4]).toHaveClass("text-destructive");
    expect(screen.getAllByRole("listitem")[2]).toHaveClass("text-muted-foreground");
  });

  it("le détail d'une étape en échec est affiché", () => {
    render(<ProgressChecklist items={items} />);
    expect(screen.getByText("Ce nom est déjà pris.")).toBeInTheDocument();
  });

  it("annonce : role=status par défaut, retirable", () => {
    const { rerender } = render(<ProgressChecklist items={items} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    rerender(<ProgressChecklist items={items} announce={false} />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});

const CARD: ProjectCardProps = {
  href: "/projects/p1",
  name: "Portail de réservation",
  initials: "PR",
  colorKey: 1,
  client: "Marie Lefèvre · Salon Lumière",
  phase: "framing",
  progress: { label: "Livrables validés", valueLabel: "2 sur 7", done: 2, total: 7 },
  next: { title: "Le cahier fonctionnel attend la validation de Marie", attention: true },
  people: [
    { initials: "ML", name: "Marie Lefèvre", isClient: true },
    { initials: "AK", name: "Awa Koné" },
  ],
  activity: "Marie, il y a 2 h",
};

const RouterLink = ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) => (
  <a data-router="1" href={href} {...rest}>
    {children}
  </a>
);

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("ProjectCard", () => {
  it("un seul lien, nom accessible tiré du contenu visible (nom, phase, avancement, prochaine étape, activité)", () => {
    render(<ProjectCard {...CARD} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/projects/p1");
    expect(link).not.toHaveAttribute("aria-label");
    expect(link).toHaveAccessibleName(
      /^Portail de réservation.*Cadrage · 2\/4.*Livrables validés.*2 sur 7.*Le cahier fonctionnel attend la validation de Marie.*Marie, il y a 2 h$/,
    );
    expect(link).toHaveClass("rounded-dialog", "border", "border-border", "p-[18px]", "gap-3.5");
    expect(link).toHaveClass("hover:border-border-strong");
  });

  it("contenu : nom 16/600, client, pastille de phase, avancement et jauge", () => {
    const { container } = render(<ProjectCard {...CARD} />);
    expect(screen.getByText("Portail de réservation")).toHaveClass("font-semibold");
    expect(screen.getByText("Marie Lefèvre · Salon Lumière")).toHaveClass("text-muted-foreground");
    expect(container.querySelector("[data-slot='phase-pill']")).toHaveTextContent("Cadrage · 2/4");
    expect(screen.getByText("Livrables validés")).toHaveClass("text-muted-foreground");
    expect(screen.getByText("2 sur 7")).toHaveClass("font-semibold");
    expect(container.querySelector("[data-slot='segmented-gauge']")).not.toBeNull();
    expect(container.querySelector("[data-slot='project-tile']")).toHaveClass("size-10");
  });

  it("prochaine étape à attention : ton warning, icône schedule", () => {
    const { container } = render(<ProjectCard {...CARD} />);
    const next = container.querySelector("[data-slot='project-card-next']") as HTMLElement;
    expect(next).toHaveAttribute("data-tone", "warning");
    expect(next).toHaveClass(
      "bg-alert-warning",
      "border-alert-warning-border",
      "text-alert-warning-foreground",
    );
    expect(next).toHaveTextContent("Le cahier fonctionnel attend la validation de Marie");
  });

  it("prochaine étape sans attention : ton neutre sur --surface", () => {
    const { container } = render(
      <ProjectCard {...CARD} next={{ title: "2 tickets attendent une revue", attention: false }} />,
    );
    const next = container.querySelector("[data-slot='project-card-next']") as HTMLElement;
    expect(next).toHaveAttribute("data-tone", "neutral");
    expect(next).toHaveClass("bg-surface", "border-border");
  });

  it("sans prochaine étape : « Rien n'attend d'action »", () => {
    render(<ProjectCard {...CARD} next={null} />);
    expect(screen.getByText("Rien n'attend d'action")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAccessibleName(
      /^Portail de réservation.*Cadrage.*Livrables validés.*2 sur 7.*Rien n'attend d'action/,
    );
  });

  it("pied : avatars (client en ton warning) et activité", () => {
    const { container } = render(<ProjectCard {...CARD} />);
    expect(container.querySelectorAll("[data-slot='avatar-group'] [data-size='24']")).toHaveLength(
      2,
    );
    expect(container.querySelector("[data-tone='warning']")).not.toBeNull();
    expect(screen.getByText("Marie, il y a 2 h")).toBeInTheDocument();
  });

  it("client absent : « Aucun client invité » fourni par l'appelant, sans activité : pas de texte", () => {
    render(<ProjectCard {...CARD} client="Aucun client invité" activity={null} />);
    expect(screen.getByText("Aucun client invité")).toBeInTheDocument();
    expect(screen.queryByText(/il y a/)).toBeNull();
  });

  it("LinkComponent injecté pour le routeur", () => {
    const { container } = render(<ProjectCard {...CARD} LinkComponent={RouterLink} />);
    expect(container.querySelector("[data-router='1']")).not.toBeNull();
  });
});

describe("ProjectCard creating", () => {
  const steps = [
    { key: "project", label: "Projet créé", status: "done" },
    { key: "idea", label: "Dossier d'idée prêt (10 pages)", status: "done" },
    { key: "repo", label: "Création du dépôt de spec sur GitHub…", status: "running" },
  ] as const;

  it("cadre pointillé primary sur --diff-bg, role=status unique, tuile 36", () => {
    const { container } = render(
      <ProjectCardCreating
        name="Atelier neuf"
        initials="AN"
        colorKey={2}
        steps={steps}
        note="Vous pouvez déjà ouvrir le projet et écrire l'idée."
        href="/projects/p2"
      />,
    );
    const box = screen.getByRole("status");
    expect(box).toHaveClass("border-dashed", "border-primary", "bg-diff-bg", "rounded-dialog");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(container.querySelector("[data-slot='project-tile']")).toHaveClass("size-9");
    expect(screen.getByText("Atelier neuf")).toHaveClass("font-semibold");
    expect(screen.getByText("Vous pouvez déjà ouvrir le projet et écrire l'idée.")).toHaveClass(
      "text-muted-foreground",
    );
  });

  it("bouton « Ouvrir le projet » : un lien vers le projet", () => {
    render(
      <ProjectCardCreating
        name="Atelier neuf"
        initials="AN"
        colorKey={2}
        steps={steps}
        href="/projects/p2"
      />,
    );
    expect(screen.getByRole("link", { name: /Ouvrir le projet/ })).toHaveAttribute(
      "href",
      "/projects/p2",
    );
  });

  it("actions de l'appelant (échec) sous la liste", () => {
    render(
      <ProjectCardCreating
        name="Atelier neuf"
        initials="AN"
        colorKey={2}
        steps={steps}
        href="/projects/p2"
        actions={<button type="button">Réessayer</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
  });
});

describe("ShellNavItem avec `leading` (groupe Récents de la barre, maquette 08 l.38-41)", () => {
  it("la tuile remplace l'icône : lien nommé par le libellé, 36 de haut, tuile décorative", () => {
    const { container } = render(
      <ShellNavItem
        href="/projects/p1"
        label="Portail de réservation"
        leading={<ProjectTile initials="PR" colorKey={1} size={22} />}
      />,
    );
    const link = screen.getByRole("link", { name: "Portail de réservation" });
    expect(link).toHaveAttribute("href", "/projects/p1");
    expect(link).toHaveClass("h-9");
    expect(container.querySelector("[data-slot='project-tile']")).not.toBeNull();
    expect(container.querySelector("svg")).toBeNull();
  });
});
