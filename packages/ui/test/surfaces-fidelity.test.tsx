// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  Card,
  DialogBody,
  DialogFooter,
  DialogHeader,
  InlineAlert,
  SheetFooter,
  StatCard,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
  ToastProvider,
  useToast,
} from "../src/index.ts";

function Go() {
  const { toast } = useToast();
  return (
    <button
      type="button"
      onClick={() => toast({ title: "Fait", action: { label: "OK", onClick: vi.fn() } })}
    >
      Lancer
    </button>
  );
}

/** TK-139 correction 1 : écarts mesurables aux planches 04, 08, 22 et 24. */
describe("fidélité aux maquettes (TK-139, correction 1)", () => {
  it("InlineAlert : contenu centré, action en padding 10 et rayon 6 (04 l.150-153)", () => {
    render(
      <InlineAlert variant="neutral" icon="lightbulb" action={{ label: "Voir", onClick: vi.fn() }}>
        Deux lignes
      </InlineAlert>,
    );
    const row = screen.getByRole("note").firstElementChild as HTMLElement;
    expect(row).toHaveClass("items-center");
    expect(row).not.toHaveClass("items-start");
    expect(screen.getByRole("button", { name: "Voir" })).toHaveClass("px-2.5", "rounded-md");
  });

  it("pieds de dialogue et de tiroir : en ligne, à droite, jamais empilés (08 l.157, 22 l.205)", () => {
    render(
      <>
        <DialogFooter data-testid="d">x</DialogFooter>
        <SheetFooter data-testid="s">x</SheetFooter>
      </>,
    );
    for (const id of ["d", "s"]) {
      const footer = screen.getByTestId(id);
      expect(footer).toHaveClass("justify-end");
      expect(footer.className).not.toMatch(/flex-col/);
    }
  });

  it("Dialog : en-tête 18 haut / 14 bas, corps sans marge haute (08 l.126-130)", () => {
    render(
      <>
        <DialogHeader data-testid="h">x</DialogHeader>
        <DialogBody data-testid="b">x</DialogBody>
      </>,
    );
    expect(screen.getByTestId("h")).toHaveClass("pt-[18px]", "pb-3.5");
    expect(screen.getByTestId("b")).toHaveClass("pb-[18px]");
    expect(screen.getByTestId("b").className).not.toMatch(/\bpy-4\b/);
  });
});

describe("fidélité aux maquettes (TK-139, correction 1), suite", () => {
  it("Toast : dimensionné au contenu, action 24 px de haut (22 l.179)", async () => {
    render(
      <ToastProvider>
        <Go />
      </ToastProvider>,
    );
    act(() => screen.getByRole("button", { name: "Lancer" }).click());
    const card = document.querySelector("[data-slot='toast']") as HTMLElement;
    expect(card).toHaveClass("w-fit");
    expect(screen.getByText("Fait")).not.toHaveClass("flex-1");
    expect(screen.getByRole("button", { name: "OK" })).toHaveClass("h-6", "px-1.5");
  });

  it("Table : corps à 13 px (text-meta), pas 14 (24 l.101)", () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>x</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(screen.getByRole("table")).toHaveClass("text-meta");
    expect(screen.getByRole("table")).not.toHaveClass("text-sm");
  });

  it("StatCard 14 / 16, note 12 / 400 ; Card proposal 18 partout", () => {
    render(
      <>
        <StatCard label="L" value="1" note="n" />
        <Card variant="proposal">p</Card>
      </>,
    );
    expect(document.querySelector("[data-slot='stat-card']")).toHaveClass("px-4", "py-3.5");
    expect(screen.getByText("n")).toHaveClass("text-caption", "font-normal");
    expect(screen.getByText("p")).toHaveClass("p-[18px]");
  });

  it("Tabs underline : icône et libellé à 6 px", () => {
    render(
      <Tabs defaultValue="a" variant="underline">
        <TabsList aria-label="V">
          <TabsTrigger value="a" icon="edit">
            A
          </TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    expect(screen.getByRole("tab")).toHaveClass("gap-1.5");
  });
});
