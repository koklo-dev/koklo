// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Badge, badgeVariants, CountBadge, Dot, IdTag, Pill, RolePill } from "../src/index.ts";

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Pill (DESIGN.md §5.5)", () => {
  it.each([
    ["xs", ["h-[18px]", "text-count", "px-1.5"]],
    ["sm", ["h-[22px]", "text-count", "px-2", "gap-1"]],
    ["md", ["h-6", "text-caption", "px-2.5"]],
  ] as const)("taille %s : classes de la mesure", (size, classes) => {
    render(<Pill size={size}>Libellé</Pill>);
    const el = screen.getByText("Libellé");
    expect(el).toHaveClass("rounded-full", ...classes);
  });

  it("md est la taille par défaut, avec icône : pl-1.5 gap-1.5 et icône 16 pleine", () => {
    const { container } = render(<Pill icon="check_circle">Ok</Pill>);
    const el = container.firstElementChild as HTMLElement;
    expect(el).toHaveClass("h-6", "pl-1.5", "gap-1.5");
    expect(container.querySelector("svg")).toHaveAttribute("width", "16");
  });

  it("sm avec icône : icône 14", () => {
    const { container } = render(
      <Pill size="sm" icon="check_circle">
        Ok
      </Pill>,
    );
    expect(container.querySelector("svg")).toHaveAttribute("width", "14");
  });

  it.each([
    ["neutral", ["bg-secondary", "text-foreground"]],
    ["soft", ["bg-secondary", "text-secondary-foreground"]],
    ["outline", ["border", "border-border", "text-muted-foreground"]],
    ["dashed", ["border-dashed", "border-border-strong", "text-muted-foreground"]],
    ["primary", ["bg-primary", "text-primary-foreground"]],
    ["success", ["bg-status-validated", "text-status-validated-foreground"]],
    ["warning", ["bg-status-pending", "text-status-pending-foreground"]],
    ["danger", ["bg-status-revise", "text-status-revise-foreground"]],
    ["muted", ["bg-secondary", "text-muted-foreground"]],
  ] as const)("ton %s : jetons de couleur", (tone, classes) => {
    render(<Pill tone={tone}>Texte</Pill>);
    expect(screen.getByText("Texte")).toHaveClass(...classes);
  });

  it("sans interactive : aucun rôle bouton", () => {
    render(<Pill>Statique</Pill>);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("interactive : bouton focusable, flèche 16, Entrée active", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <Pill interactive onClick={onClick}>
        Tous les rôles
      </Pill>,
    );
    const btn = screen.getByRole("button", { name: "Tous les rôles" });
    expect(btn).toHaveClass("pr-1.5");
    expect(container.querySelector("svg[width='16']")).not.toBeNull();
    await user.tab();
    expect(btn).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("Badge : alias de Pill", () => {
  it("rend une pastille sm, ton soft par défaut", () => {
    const el = render(<Badge>1</Badge>).container.firstElementChild;
    expect(el).toHaveClass("rounded-full", "h-[22px]", "bg-secondary", "text-secondary-foreground");
  });

  it("outline et destructive", () => {
    const { container } = render(
      <>
        <Badge variant="outline">a</Badge>
        <Badge variant="destructive">b</Badge>
      </>,
    );
    expect(container.children[0]).toHaveClass("border", "border-border");
    expect(container.children[1]).toHaveClass("bg-destructive", "text-destructive-foreground");
  });

  it("badgeVariants reste exporté", () => {
    expect(badgeVariants({ variant: "outline" })).toContain("border-border");
  });
});

describe("CountBadge et Dot", () => {
  it("CountBadge : Pill xs px-[7px], nom accessible = texte", () => {
    render(<CountBadge>12</CountBadge>);
    const el = screen.getByText("12");
    expect(el).toHaveClass("h-[18px]", "px-[7px]", "text-count", "bg-secondary");
  });

  it.each(["soft", "primary", "success", "warning", "outline"] as const)("ton %s", (tone) => {
    render(<CountBadge tone={tone}>3</CountBadge>);
    expect(screen.getByText("3")).toHaveAttribute("data-tone", tone);
  });

  it("Dot : 7 px rond primaire, role img nommé", () => {
    render(<Dot aria-label="Nouveau" />);
    const dot = screen.getByRole("img", { name: "Nouveau" });
    expect(dot).toHaveClass("size-[7px]", "rounded-full", "bg-primary");
  });

  it("Dot sans aria-label est une erreur de type", () => {
    // @ts-expect-error aria-label est obligatoire
    const el = <Dot />;
    expect(el).toBeDefined();
  });
});

describe("RolePill", () => {
  it.each([
    ["owner", "Propriétaire", "bg-secondary"],
    ["admin", "Administrateur", "bg-secondary"],
    ["developer", "Développeur", "border-border"],
    ["designer", "Designer", "border-border"],
    ["business", "Business", "border-border"],
    ["client", "Client", "bg-status-pending"],
  ] as const)("%s : libellé français et ton", (role, label, cls) => {
    render(<RolePill role={role} />);
    expect(screen.getByText(label)).toHaveClass("h-6", cls);
  });

  it("tone impose la teinte (en-tête de Réglages : développeur plein, TK-141)", () => {
    const role = "developer" as const;
    render(<RolePill role={role} tone="soft" />);
    expect(screen.getByText("Développeur")).toHaveClass("bg-secondary");
  });

  it("icône facultative : pleine, décorative, avant le libellé (TK-141)", () => {
    const role = "owner" as const;
    render(<RolePill role={role} icon="badge" data-testid="pill" />);
    const pill = screen.getByTestId("pill");
    expect(pill.querySelector('svg[data-icon="badge"]')).toHaveAttribute("aria-hidden", "true");
    expect(pill).toHaveTextContent("Propriétaire");
  });
});

describe("IdTag", () => {
  it("défaut : mono 22 px, rayon 6, ton soft", () => {
    render(<IdTag>TK-138</IdTag>);
    expect(screen.getByText("TK-138")).toHaveClass(
      "font-mono",
      "text-code",
      "h-[22px]",
      "px-1.5",
      "rounded-md",
      "bg-secondary",
    );
  });

  it("outline et sm", () => {
    render(
      <IdTag tone="outline" size="sm">
        S-12
      </IdTag>,
    );
    expect(screen.getByText("S-12")).toHaveClass("border", "h-5", "text-code-sm");
  });

  it("variante pill avec préfixe", () => {
    render(
      <IdTag variant="pill" prefix="Fournisseur A">
        modèle-1
      </IdTag>,
    );
    const el = screen.getByText("modèle-1").closest("[data-slot='id-tag']") as HTMLElement;
    expect(el).toHaveClass("h-[30px]", "rounded-full", "border", "bg-surface");
    expect(screen.getByText("Fournisseur A")).toHaveClass("text-muted-foreground");
  });
});
