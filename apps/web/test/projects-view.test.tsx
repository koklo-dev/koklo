import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProjectsView } from "../src/components/projects-view.tsx";

const noop = () => undefined;
const projects = [
  { id: "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b01", name: "Alpha" },
  { id: "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b02", name: "Beta" },
];

describe("ProjectsView — chargement", () => {
  it("annonce le chargement via role=status, aria-busy et un libellé", () => {
    render(<ProjectsView state={{ status: "loading" }} onRetry={noop} />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveTextContent("Chargement des projets…");
    expect(screen.getByTestId("projects-loading")).toBe(status);
  });

  it("n'affiche ni tableau ni message d'erreur pendant le chargement", () => {
    render(<ProjectsView state={{ status: "loading" }} onRetry={noop} />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("ProjectsView — vide", () => {
  it("affiche le message d'état vide et aucun tableau", () => {
    render(<ProjectsView state={{ status: "success", projects: [] }} onRetry={noop} />);
    const empty = screen.getByTestId("projects-empty");
    expect(
      within(empty).getByRole("heading", { name: "Aucun projet pour le moment" }),
    ).toBeInTheDocument();
    expect(empty).toHaveTextContent("Les projets auxquels vous avez accès apparaîtront ici.");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("ProjectsView — données", () => {
  it("rend un tableau nommé « Liste des projets » avec la colonne « Nom »", () => {
    render(<ProjectsView state={{ status: "success", projects }} onRetry={noop} />);
    expect(screen.getByRole("table", { name: "Liste des projets" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Nom" })).toBeInTheDocument();
  });

  it("rend un nom par ligne et n'affiche pas l'identifiant technique", () => {
    render(<ProjectsView state={{ status: "success", projects }} onRetry={noop} />);
    // TK-48d : le nom est un lien ; son nom accessible porte le suffixe « : fonctionnalités »
    expect(screen.getByRole("cell", { name: /^Alpha\s?:\s?fonctionnalités$/ })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: /^Beta\s?:\s?fonctionnalités$/ })).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(projects.length + 1);
    expect(screen.queryByText(projects[0]?.id ?? "")).not.toBeInTheDocument();
  });

  it("accorde le compteur au pluriel", () => {
    const { rerender } = render(
      <ProjectsView state={{ status: "success", projects }} onRetry={noop} />,
    );
    expect(screen.getByText("2 projets")).toBeInTheDocument();
    rerender(
      <ProjectsView state={{ status: "success", projects: projects.slice(0, 1) }} onRetry={noop} />,
    );
    expect(screen.getByText("1 projet")).toBeInTheDocument();
  });
});

describe("ProjectsView — erreur", () => {
  it("affiche une alerte avec titre et texte (pas la couleur seule)", () => {
    render(<ProjectsView state={{ status: "error" }} onRetry={noop} />);
    const alert = screen.getByRole("alert");
    expect(alert).toBe(screen.getByTestId("projects-error"));
    expect(alert).toHaveTextContent("Impossible de charger les projets");
    expect(alert).toHaveTextContent(
      "Une erreur est survenue. Vérifiez votre connexion puis réessayez.",
    );
  });

  it("relance la requête via le bouton « Réessayer »", async () => {
    const onRetry = vi.fn();
    render(<ProjectsView state={{ status: "error" }} onRetry={onRetry} />);
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("ProjectsView — lien vers les fonctionnalités (TK-48d)", () => {
  it("chaque nom est un vrai lien vers /projects/<id>/features", () => {
    render(<ProjectsView state={{ status: "success", projects }} onRetry={noop} />);
    for (const project of projects) {
      const link = screen.getByRole("link", {
        name: new RegExp(`^${project.name}\\s?:\\s?fonctionnalités$`),
      });
      expect(link.tagName).toBe("A");
      expect(link).toHaveAttribute("href", `/projects/${project.id}/features`);
      expect(link).toHaveTextContent(project.name);
    }
    expect(screen.getAllByRole("link")).toHaveLength(projects.length);
  });

  it("le nom visible reste le nom du projet ; le suffixe n'est lu que par les lecteurs d'écran", () => {
    render(<ProjectsView state={{ status: "success", projects }} onRetry={noop} />);
    const suffix = screen.getAllByText(/fonctionnalités/)[0] as HTMLElement;
    expect(suffix.className).toMatch(/sr-only/);
    expect(screen.queryByText(projects[0]?.id ?? "")).not.toBeInTheDocument();
  });

  it("l'identifiant technique n'est jamais affiché malgré l'adresse du lien", () => {
    render(<ProjectsView state={{ status: "success", projects }} onRetry={noop} />);
    expect(document.body.textContent).not.toContain(projects[1]?.id ?? "");
  });

  it("états chargement, vide et erreur : aucun lien de projet", () => {
    const { rerender } = render(<ProjectsView state={{ status: "loading" }} onRetry={noop} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    rerender(<ProjectsView state={{ status: "success", projects: [] }} onRetry={noop} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    rerender(<ProjectsView state={{ status: "error" }} onRetry={noop} />);
    expect(screen.queryByRole("link", { name: /fonctionnalités/ })).not.toBeInTheDocument();
  });
});
