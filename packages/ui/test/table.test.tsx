// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  Table,
  TableBody,
  TableCaption,
  TableHead,
  TableHeader,
  TableRow,
  YesNoCell,
} from "../src/index.ts";

/** TK-139 lot C, cas 16 : `Table` framed / dense / stickyHeader, `YesNoCell`. */
function Sample(props: React.ComponentProps<typeof Table>) {
  return (
    <Table {...props}>
      <TableCaption className="sr-only">Membres</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Membre</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableHead scope="row">Ada</TableHead>
          <YesNoCell value />
          <YesNoCell value={false} />
        </TableRow>
      </TableBody>
    </Table>
  );
}

describe("Table", () => {
  it("non encadrée par défaut, en-tête text-caption (plus de text-[13px])", () => {
    render(<Sample />);
    const wrapper = screen.getByRole("table").parentElement as HTMLElement;
    expect(wrapper.className).not.toContain("rounded-xl");
    const th = screen.getByRole("columnheader", { name: "Membre" });
    expect(th.className).toContain("text-caption");
    expect(th.className).not.toContain("text-[13px]");
  });

  it("framed : cadre --border rayon 12, défilement dans le cadre, en-tête --surface", () => {
    render(<Sample framed />);
    const wrapper = screen.getByRole("table").parentElement as HTMLElement;
    expect(wrapper.className).toMatch(/border/);
    expect(wrapper.className).toContain("rounded-xl");
    expect(wrapper.className).toContain("overflow-auto");
    expect(screen.getByRole("table").querySelector("thead")?.className).toContain("bg-surface");
  });

  it("framed : cadre atteignable au clavier, classes du cadre acceptées", () => {
    render(<Sample framed frameClassName="max-h-48" />);
    const wrapper = screen.getByRole("table").parentElement as HTMLElement;
    expect(wrapper).toHaveAttribute("tabindex", "0");
    expect(wrapper.className).toContain("max-h-48");
  });

  it("stickyHeader : en-tête collant ; dense : 12 px", () => {
    render(<Sample framed stickyHeader dense />);
    const table = screen.getByRole("table");
    expect(table.querySelector("thead")?.className).toContain("sticky");
    expect(table.querySelector("thead")?.className).toContain("top-0");
    expect(table.className).toContain("text-caption");
  });

  it("légende sr-only et th scope=row", () => {
    render(<Sample />);
    expect(screen.getByText("Membres").className).toContain("sr-only");
    expect(screen.getByRole("rowheader", { name: "Ada" })).toBeInTheDocument();
  });
});

describe("YesNoCell", () => {
  it("Oui : coche --status-validated-fg ; Non : remove --border-strong ; nommées", () => {
    render(<Sample />);
    const yes = screen.getByRole("img", { name: "Oui" });
    const no = screen.getByRole("img", { name: "Non" });
    expect(yes).toHaveAttribute("data-icon", "check");
    expect(yes.getAttribute("class")).toContain("text-status-validated-foreground");
    expect(no).toHaveAttribute("data-icon", "remove");
    expect(no.getAttribute("class")).toContain("text-border-strong");
    expect(yes.closest("td")?.className).toContain("text-center");
  });
});
