// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ProposalDetail,
  ProposalReview,
  type ProposalReviewGroup,
  type ProposalReviewItem,
  type ProposalReviewProps,
  type ProposalStatus,
} from "../src/index.ts";

/** TK-107 lot C : texte du bandeau propre à un livrable (Données, maquette 11 l.113-122). */
describe("ProposalReview : texte du bandeau", () => {
  it("summaryText remplace le décompte par défaut", () => {
    setup({
      summaryText:
        " · l'agent propose 12 éléments depuis le cahier fonctionnel · 3 acceptés · 7 à relire",
    });
    const banner = screen.getByRole("group", { name: "Mode relecture" });
    expect(banner).toHaveTextContent(
      "Mode relecture · l'agent propose 12 éléments depuis le cahier fonctionnel · 3 acceptés · 7 à relire",
    );
    expect(banner).not.toHaveTextContent("rejetées");
  });
});

/** TK-99b lot A, cas 7 (maquette 10 l.114-168, 506-560, 819-826) : relecture à plat (30 propositions au plus). */
const STATUSES: ProposalStatus[] = ["accepted", "accepted", "accepted", "rejected", "rejected"];

function items(count: number): ProposalReviewItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    ref: `F-${String(i + 1).padStart(3, "0")}`,
    title: `Fonctionnalité ${i + 1}`,
    subtitle: "Fonctionnalité · Haute · 2 critères",
    status: STATUSES[i] ?? "pending",
  }));
}

function flat(count = 12): ProposalReviewGroup[] {
  const list = items(count);
  const accepted = list.filter((i) => i.status === "accepted").length;
  return [
    {
      key: "all",
      label: "Toutes",
      counts: { total: count, accepted, pending: count - accepted - 2 },
      matching: count,
      items: list,
    },
  ];
}

function setup(overrides: Partial<ProposalReviewProps> = {}) {
  const props: ProposalReviewProps = {
    counts: { total: 12, accepted: 3, rejected: 2, pending: 7 },
    groups: flat(),
    selectedId: "p6",
    onSelect: vi.fn(),
    onDecide: vi.fn(),
    onSave: vi.fn(),
    onLeave: vi.fn(),
    announcement: "",
    ...overrides,
  };
  const view = render(
    <ProposalReview {...props}>
      <ProposalDetail
        item={items(12)[5] as ProposalReviewItem}
        why="Le dossier d'idée cite la réservation en ligne."
        onDecide={props.onDecide}
        onEdit={vi.fn()}
        onRevise={vi.fn()}
      >
        <p>Description de la fonctionnalité.</p>
      </ProposalDetail>
    </ProposalReview>,
  );
  return { props, ...view };
}

describe("ProposalReview : bandeau et barre", () => {
  it("« Mode relecture · N propositions · A acceptées · R rejetées · P à relire »", () => {
    setup();
    const banner = screen.getByRole("group", { name: "Mode relecture" });
    expect(banner.textContent).toContain(
      "Mode relecture · 12 propositions · 3 acceptées · 2 rejetées · 7 à relire",
    );
  });

  it("singulier : « 1 proposition · 1 acceptée · 0 rejetée »", () => {
    setup({ counts: { total: 1, accepted: 1, rejected: 0, pending: 0 } });
    expect(screen.getByRole("group", { name: "Mode relecture" }).textContent).toContain(
      "1 proposition · 1 acceptée · 0 rejetée · 0 à relire",
    );
  });

  it("barre de 6 px : acceptées 25 %, rejetées 16,7 %", () => {
    setup();
    const bar = screen.getByRole("progressbar", { name: "Avancement de la relecture" });
    expect(bar).toHaveClass("h-1.5");
    expect(bar).toHaveAttribute("aria-valuenow", "25");
    expect((bar.children[1] as HTMLElement).style.width).toMatch(/^16\.6/);
  });

  it("« Enregistrer A dans la spec » appelle onSave ; « Quitter la relecture » appelle onLeave", async () => {
    const { props } = setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Enregistrer 3 dans la spec" }));
    expect(props.onSave).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Quitter la relecture" }));
    expect(props.onLeave).toHaveBeenCalledTimes(1);
  });

  it("sans acceptée : message à la place du bouton", () => {
    setup({ counts: { total: 12, accepted: 0, rejected: 0, pending: 12 } });
    expect(screen.getByText("Acceptez au moins une proposition pour enregistrer.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Enregistrer/ })).toBeNull();
  });

  it("enregistrement en cours : bouton inactif", () => {
    setup({ saving: true });
    expect(screen.getByRole("button", { name: "Enregistrer 3 dans la spec" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("une seule région d'annonce polie (role=status), qui ne vole pas le focus", () => {
    setup({ announcement: "12 propositions arrivées" });
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("12 propositions arrivées");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});

describe("ProposalReview : liste à plat de 330 px", () => {
  it("liste nommée, panneau de 330, un élément par proposition avec identifiant, titre, sous-titre et état nommé", () => {
    setup();
    const list = screen.getByRole("list", { name: "Propositions à relire" });
    expect(list.closest("[data-slot=proposal-review-list]")).toHaveClass(
      "flex-[0_0_330px]",
      "max-w-full",
    );
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(12);
    expect(rows[0]).toHaveAttribute("aria-setsize", "12");
    expect(rows[0]).toHaveAttribute("aria-posinset", "1");
    expect(within(rows[0] as HTMLElement).getByText("F-001")).toBeVisible();
    expect(within(rows[0] as HTMLElement).getByText("Fonctionnalité 1")).toBeVisible();
    expect(within(rows[0] as HTMLElement).getByRole("img", { name: "Acceptée" })).toBeVisible();
    expect(within(rows[3] as HTMLElement).getByRole("img", { name: "Rejetée" })).toBeVisible();
    expect(within(rows[5] as HTMLElement).getByRole("img", { name: "À relire" })).toBeVisible();
  });

  it("élément courant : aria-current ; clic : onSelect", async () => {
    const { props } = setup();
    const current = screen.getByRole("button", { name: /Fonctionnalité 6/ });
    expect(current).toHaveAttribute("aria-current", "true");
    await userEvent.setup().click(screen.getByRole("button", { name: /Fonctionnalité 2/ }));
    expect(props.onSelect).toHaveBeenCalledWith("p2");
  });

  it("à 30 propositions ou moins : pas de filtres, pas d'en-tête de groupe, pas de « Accepter les N »", () => {
    setup();
    expect(screen.queryByRole("button", { name: /^À relire/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Accepter les/ })).toBeNull();
    expect(document.querySelector("[aria-expanded]")).toBeNull();
  });

  it("proposition liée à un lot échoué : état « Enregistrement échoué », non comptée à relire", () => {
    const groups = flat();
    (groups[0]?.items[6] as ProposalReviewItem).status = "blocked";
    setup({ groups });
    const row = screen.getAllByRole("listitem")[6] as HTMLElement;
    expect(within(row).getByRole("img", { name: "Enregistrement échoué" })).toBeVisible();
  });

  it("tout est relu : message et rappel de l'enregistrement", () => {
    setup({
      counts: { total: 3, accepted: 3, rejected: 0, pending: 0 },
      groups: [
        {
          key: "all",
          label: "Toutes",
          counts: { total: 3, accepted: 3, pending: 0 },
          matching: 0,
          items: [],
        },
      ],
      selectedId: undefined,
    });
    expect(screen.getByText("Tout est relu. Enregistrez les 3 acceptées.")).toBeVisible();
  });
});

describe("ProposalReview : raccourcis J, K, A, R (2.1.4)", () => {
  it("J et K : suivante et précédente, aux limites rien ne bouge", async () => {
    const { props } = setup();
    const user = userEvent.setup();
    screen.getByRole("button", { name: /Fonctionnalité 6/ }).focus();
    await user.keyboard("j");
    expect(props.onSelect).toHaveBeenLastCalledWith("p7");
    await user.keyboard("k");
    expect(props.onSelect).toHaveBeenLastCalledWith("p5");
  });

  it("J sur la dernière proposition : aucun appel", async () => {
    const { props } = setup({ selectedId: "p12" });
    screen.getByRole("button", { name: /Fonctionnalité 12/ }).focus();
    await userEvent.setup().keyboard("j");
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it("A accepte la proposition courante et sélectionne la suivante à relire ; R rejette", async () => {
    const { props } = setup();
    const user = userEvent.setup();
    screen.getByRole("button", { name: /Fonctionnalité 6/ }).focus();
    await user.keyboard("a");
    expect(props.onDecide).toHaveBeenLastCalledWith("p6", "accepted");
    expect(props.onSelect).toHaveBeenLastCalledWith("p7");
    await user.keyboard("r");
    expect(props.onDecide).toHaveBeenLastCalledWith("p6", "rejected");
  });

  it("A sur une proposition déjà décidée : rien", async () => {
    const { props } = setup({ selectedId: "p1" });
    (screen.getByText("Fonctionnalité 1").closest("button") as HTMLElement).focus();
    await userEvent.setup().keyboard("a");
    expect(props.onDecide).not.toHaveBeenCalled();
  });

  it("jamais dans un champ de saisie, ni avec une touche de modification", async () => {
    const { props } = setup();
    const user = userEvent.setup();
    const field = screen.getByRole("textbox", { name: "Demander une modification à l'agent" });
    await user.type(field, "ajoute");
    expect(props.onDecide).not.toHaveBeenCalled();
    expect(props.onSelect).not.toHaveBeenCalled();
    screen.getByRole("button", { name: /Fonctionnalité 6/ }).focus();
    fireEvent.keyDown(document.activeElement as Element, { key: "a", ctrlKey: true });
    expect(props.onDecide).not.toHaveBeenCalled();
  });

  it("les raccourcis ne sont actifs que dans la relecture (pas de touche globale)", async () => {
    const { props } = setup();
    (document.body as HTMLElement).focus();
    await userEvent.setup().keyboard("a");
    expect(props.onDecide).not.toHaveBeenCalled();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("ProposalDetail : détail et actions", () => {
  it("en-tête : identifiant, titre, état ; justification ; contenu ; aide clavier", () => {
    setup();
    const detail = screen.getByRole("article");
    expect(
      within(detail).getByRole("heading", { level: 2, name: "Fonctionnalité 6" }),
    ).toBeVisible();
    expect(within(detail).getByText("F-006")).toBeVisible();
    expect(within(detail).getByText("À relire")).toBeVisible();
    expect(
      within(detail).getByText("Le dossier d'idée cite la réservation en ligne."),
    ).toBeVisible();
    expect(within(detail).getByText("Description de la fonctionnalité.")).toBeVisible();
    expect(
      within(detail).getByText("J / K : suivante / précédente · A : accepter · R : rejeter"),
    ).toBeVisible();
  });

  it("à relire : Accepter (A), Modifier, Rejeter (R), demande à l'agent", async () => {
    const { props } = setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^Accepter/ }));
    expect(props.onDecide).toHaveBeenLastCalledWith("p6", "accepted");
    await user.click(screen.getByRole("button", { name: /^Rejeter/ }));
    expect(props.onDecide).toHaveBeenLastCalledWith("p6", "rejected");
    expect(screen.getByRole("button", { name: "Modifier" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Envoyer la demande" })).toBeVisible();
  });

  it("demande de modification : Entrée envoie le texte, puis le champ est vidé", async () => {
    const onRevise = vi.fn();
    const user = userEvent.setup();
    render(
      <ProposalDetail
        item={items(6)[5] as ProposalReviewItem}
        onDecide={vi.fn()}
        onRevise={onRevise}
      >
        <p>Corps</p>
      </ProposalDetail>,
    );
    const field = screen.getByRole("textbox", {
      name: "Demander une modification à l'agent",
    }) as HTMLInputElement;
    await user.type(field, "Ajoute un cas limite{Enter}");
    expect(onRevise).toHaveBeenCalledWith("Ajoute un cas limite");
    expect(field.value).toBe("");
  });

  it("décidée : « Remettre à relire » remet en attente", async () => {
    const onDecide = vi.fn();
    render(
      <ProposalDetail item={items(1)[0] as ProposalReviewItem} onDecide={onDecide}>
        <p>Corps</p>
      </ProposalDetail>,
    );
    expect(screen.queryByRole("button", { name: /^Accepter/ })).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: "Remettre à relire" }));
    expect(onDecide).toHaveBeenCalledWith("p1", "pending");
  });

  it("lot échoué : « Enregistrement échoué · à reprendre par l'équipe technique », aucune action", () => {
    const blocked = { ...items(1)[0], status: "blocked" } as ProposalReviewItem;
    render(
      <ProposalDetail item={blocked} onDecide={vi.fn()}>
        <p>Corps</p>
      </ProposalDetail>,
    );
    expect(
      screen.getByText("Enregistrement échoué · à reprendre par l'équipe technique"),
    ).toBeVisible();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("l'agent propose : la demande est inactive pendant le travail (reviseBusy)", () => {
    render(
      <ProposalDetail
        item={items(6)[5] as ProposalReviewItem}
        onDecide={vi.fn()}
        onRevise={vi.fn()}
        reviseBusy
      >
        <p>Corps</p>
      </ProposalDetail>,
    );
    expect(screen.getByRole("button", { name: "Envoyer la demande" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});

describe("ProposalSkeleton", () => {
  it("six lignes de 44 px, rayon 10, masquées aux lecteurs d'écran", async () => {
    const { ProposalSkeleton } = await import("../src/index.ts");
    const { container } = render(<ProposalSkeleton />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root.children).toHaveLength(6);
    expect(root.children[0]).toHaveClass("h-11", "rounded-card", "border");
  });
});

describe("ProposalReview : enregistrement par lots", () => {
  it("enregistrement découpé : barre verte, texte « lot 2 sur 3 », sortie bloquée jusqu'à la fin", () => {
    setup({
      saving: true,
      saveProgress: { saved: 200, sending: 200, total: 512, batch: 2, batches: 3 },
    });
    const bar = screen.getByRole("progressbar", { name: "Avancement de l'enregistrement" });
    expect(bar).toHaveAttribute("aria-valuetext", "200 enregistrées sur 512");
    expect(bar.children[0]).toHaveClass("bg-status-validated-foreground");
    expect(screen.getByText("Enregistrement · lot 2 sur 3 · 200 sur 512")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quitter la relecture" })).toBeDisabled();
  });

  it("un seul lot : pas de numéro de lot", () => {
    setup({
      saving: true,
      saveProgress: { saved: 0, sending: 149, total: 149, batch: 1, batches: 1 },
    });
    expect(screen.getByText("Enregistrement · 0 sur 149")).toBeInTheDocument();
  });

  it("hors enregistrement, un avancement résiduel est ignoré : barre de relecture, sortie possible", () => {
    setup({
      saving: false,
      saveProgress: { saved: 3, sending: 0, total: 3, batch: 1, batches: 1 },
    });
    expect(
      screen.getByRole("progressbar", { name: "Avancement de la relecture" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quitter la relecture" })).toBeEnabled();
  });
});
