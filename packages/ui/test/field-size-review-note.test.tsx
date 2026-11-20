// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  Input,
  ProposalReviewList,
  type ProposalReviewListProps,
  SearchField,
} from "../src/index.ts";

describe("Input xs et note des filtres (maquette 11)", () => {
  it("Input xs : 32 px, 13 px", () => {
    render(<Input aria-label="x" fieldSize="xs" />);
    expect(screen.getByLabelText("x").className).toMatch(/\bh-8\b/);
  });

  it("SearchField transmet fieldSize", () => {
    render(<SearchField label="Chercher" fieldSize="xs" />);
    expect(screen.getByLabelText("Chercher").className).toMatch(/\bh-8\b/);
  });

  it("note des filtres : défaut puis valeur fournie", () => {
    const base: ProposalReviewListProps = {
      counts: { total: 2, pending: 2, accepted: 0, rejected: 0 },
      groups: [],
      grouped: true,
      filter: "pending" as const,
      collapsed: new Set<string>(),
      onToggleGroup: () => undefined,
      onSelect: () => undefined,
    };
    const { rerender } = render(<ProposalReviewList {...base} />);
    expect(screen.getByText("Groupé par type puis par zone")).toBeInTheDocument();
    rerender(<ProposalReviewList {...base} groupNote="Groupées par zone" />);
    expect(screen.getByText("Groupées par zone")).toBeInTheDocument();
  });
});
