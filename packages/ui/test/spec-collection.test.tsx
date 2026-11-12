// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DeliverableStatus,
  ProposalDetailLines,
  SpecCollection,
  SpecNav,
  TabsNav,
} from "../src/index.ts";
import { DESKTOP, setViewport } from "./viewport.ts";

/** TK-102 lot B : collection de la spec (maquette 10 l.179-221), pastilles de la barre, statuts Prêt et Génération. */
const LIST = <ul aria-label="Fonctionnalités" />;
const DETAIL = <h2>Réserver un créneau</h2>;

beforeEach(() => setViewport(DESKTOP));

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("SpecCollection", () => {
  it("sans fiche : la liste seule, aucune région de fiche", () => {
    render(<SpecCollection list={LIST} detailLabel="Fiche" onCloseDetail={() => undefined} />);
    expect(screen.getByRole("list", { name: "Fonctionnalités" })).toBeInTheDocument();
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("avec fiche : région nommée à bordure gauche, 380 à 440 px, liste à flex 999 1 420 px", () => {
    const { container } = render(
      <SpecCollection
        list={LIST}
        detail={DETAIL}
        detailLabel="Fiche"
        onCloseDetail={() => undefined}
      />,
    );
    const aside = screen.getByRole("complementary", { name: "Fiche" });
    expect(aside.className).toContain("border-l");
    expect(aside.className).toContain("flex-[1_1_380px]");
    expect(aside.className).toContain("xl:max-w-[440px]");
    expect(container.querySelector("[data-slot='spec-collection-list']")?.className).toContain(
      "flex-[999_1_420px]",
    );
  });

  it("sous 1280 px : panneau superposé, liste inerte, Échap ferme", async () => {
    setViewport(1000);
    const onClose = vi.fn();
    const { container } = render(
      <SpecCollection list={LIST} detail={DETAIL} detailLabel="Fiche" onCloseDetail={onClose} />,
    );
    expect(container.querySelector("[data-slot='spec-collection-list']")).toHaveAttribute("inert");
    expect(screen.getByRole("complementary").className).toContain("max-xl:fixed");
    fireEvent.keyDown(screen.getByRole("heading", { name: "Réserver un créneau" }), {
      key: "Escape",
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("à 1280 px et plus : liste active, Échap ferme aussi la fiche", () => {
    const onClose = vi.fn();
    const { container } = render(
      <SpecCollection list={LIST} detail={DETAIL} detailLabel="Fiche" onCloseDetail={onClose} />,
    );
    expect(container.querySelector("[data-slot='spec-collection-list']")).not.toHaveAttribute(
      "inert",
    );
    fireEvent.keyDown(screen.getByRole("heading"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("le bouton de fermeture porte le nom « Fermer la fiche » et un retour visible sous 1024 px", async () => {
    const onClose = vi.fn();
    render(
      <SpecCollection list={LIST} detail={DETAIL} detailLabel="Fiche" onCloseDetail={onClose} />,
    );
    const button = screen.getByRole("button", { name: "Fermer la fiche" });
    expect(button).toHaveTextContent("Fermer la fiche");
    expect(button.className).toContain("xl:hidden");
    await userEvent.click(button);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("DeliverableStatus Prêt et Génération", () => {
  it("Prêt : flèche, fond --secondary", () => {
    render(<DeliverableStatus status="ready" />);
    const pill = screen.getByText("Prêt").closest("[data-slot='deliverable-status']");
    expect(pill).toHaveAttribute("data-status", "ready");
    expect(pill?.className).toContain("bg-secondary");
  });

  it("Génération : icône tournante seulement hors réduction de mouvement", () => {
    render(<DeliverableStatus status="generating" />);
    const pill = screen.getByText("Génération").closest("[data-slot='deliverable-status']");
    expect(pill?.querySelector("svg")?.getAttribute("class")).toContain("motion-safe:animate-spin");
  });
});

describe("SpecNav badges", () => {
  const HREFS = { functional: "/p/spec/functional", data: "/p/spec/data" };

  it("pastille « 3 à relire » (primary) dans le lien de l'entrée, nom accessible complet", () => {
    render(
      <SpecNav hrefs={HREFS} badges={{ functional: { label: "3 à relire", tone: "primary" } }} />,
    );
    const link = screen.getByRole("link", { name: /^Fonctionnel,\s*3 à relire$/ });
    const badge = link.querySelector("[data-slot='spec-badge']");
    expect(badge).toHaveTextContent("3 à relire");
    expect(badge?.className).toContain("bg-primary");
    expect(badge?.className).toContain("rounded-full");
  });

  it("teintes soft et pending (ambre) ; un seul badge, aucune pastille sans badge", () => {
    render(
      <SpecNav
        hrefs={HREFS}
        badges={{
          functional: { label: "À valider", tone: "pending" },
          data: { label: "Prêt", tone: "soft" },
        }}
      />,
    );
    const badges = document.querySelectorAll("[data-slot='spec-badge']");
    expect(badges).toHaveLength(2);
    expect(badges[0]?.className).toContain("bg-status-pending");
    expect(badges[1]?.className).toContain("bg-secondary");
  });

  it("entrée verrouillée : jamais de pastille", () => {
    render(<SpecNav hrefs={{}} badges={{ functional: { label: "Prêt", tone: "soft" } }} />);
    expect(document.querySelector("[data-slot='spec-badge']")).toBeNull();
  });
});

describe("TabsNav : compteur texte et teinte", () => {
  it("« 3 à relire » en pastille pleine, « … » en pastille douce", () => {
    render(
      <TabsNav
        label="Onglets"
        tabs={[
          {
            label: "Fonctionnalités",
            href: "#a",
            active: true,
            count: "3 à relire",
            countTone: "primary",
          },
          { label: "Règles", href: "#b", count: "…" },
        ]}
      />,
    );
    const counts = document.querySelectorAll("[data-slot='count-badge']");
    expect(counts[0]).toHaveTextContent("3 à relire");
    expect(counts[0]?.className).toContain("bg-primary");
    expect(counts[1]?.className).toContain("bg-secondary");
  });
});

describe("ProposalDetailLines plain et ordered", () => {
  it("lignes nues sans cadre, en liste ordonnée, texte riche accepté", () => {
    render(
      <ProposalDetailLines
        plain
        ordered
        lines={[
          { icon: "checklist", key: "AC-1", text: <strong>AC-1 · Étant donné un créneau</strong> },
        ]}
      />,
    );
    const list = screen.getByRole("list");
    expect(list.tagName).toBe("OL");
    const item = screen.getByRole("listitem");
    expect(item.className).not.toContain("border");
    expect(item).toHaveTextContent("AC-1 · Étant donné un créneau");
  });
});
