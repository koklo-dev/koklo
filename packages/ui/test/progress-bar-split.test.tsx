// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressBar } from "../src/index.ts";

/** TK-99b lot A : `ProgressBar` variante `split` (maquette 10 l.119 et 819-826 : acceptées `--primary`, rejetées `--muted` à 50 %). */
describe("ProgressBar split", () => {
  it("deux segments : acceptées en --primary, rejetées en --muted-foreground à 50 %, piste --border-strong, 6 px", () => {
    render(<ProgressBar aria-label="Relecture" variant="split" value={25} secondary={10} />);
    const bar = screen.getByRole("progressbar", { name: "Relecture" });
    expect(bar).toHaveClass("h-1.5", "bg-border-strong");
    const [accepted, rejected] = Array.from(bar.children) as HTMLElement[];
    expect(accepted).toHaveClass("bg-primary");
    expect(accepted?.style.width).toBe("25%");
    expect(rejected).toHaveClass("bg-muted-foreground", "opacity-50");
    expect(rejected?.style.width).toBe("10%");
  });

  it("la valeur annoncée reste celle des acceptées ; les deux segments ne dépassent jamais 100 %", () => {
    render(<ProgressBar aria-label="Relecture" variant="split" value={80} secondary={60} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "80");
    const rejected = bar.children[1] as HTMLElement;
    expect(rejected.style.width).toBe("20%");
  });

  it("teinte success : remplissage vert de « Validé », part en cours à 50 % qui pulse sauf mouvement réduit", () => {
    render(<ProgressBar aria-label="Enregistrement" tone="success" value={40} pending={30} />);
    const bar = screen.getByRole("progressbar", { name: "Enregistrement" });
    const [done, running] = Array.from(bar.children) as HTMLElement[];
    expect(done).toHaveClass("bg-status-validated-foreground");
    expect(done?.style.width).toBe("40%");
    expect(running).toHaveClass(
      "bg-status-validated-foreground",
      "opacity-50",
      "motion-safe:animate-pulse",
    );
    expect(running?.style.width).toBe("30%");
    expect(bar).toHaveAttribute("aria-valuenow", "40");
  });

  it("la part en cours ne dépasse jamais 100 % avec la valeur", () => {
    render(<ProgressBar aria-label="Enregistrement" value={90} pending={40} />);
    const running = screen.getByRole("progressbar").children[1] as HTMLElement;
    expect(running.style.width).toBe("10%");
  });

  it("la variante par défaut garde un seul segment", () => {
    render(<ProgressBar aria-label="Avancement" value={40} />);
    expect(screen.getByRole("progressbar").children).toHaveLength(1);
  });
});
