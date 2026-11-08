import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProposalText } from "../src/components/idea-proposal-text.tsx";

const HOSTILE = [
  "## <script>alert(1)</script>",
  "",
  "[cliquez](http://evil.example) ![img](http://evil.example/x.png)",
  "",
  "- <img src=x onerror=alert(1)>",
  "- [javascript](javascript:alert(1))",
].join("\n");

describe("ProposalText : rendu littéral d'une proposition (C2b)", () => {
  it("titres, listes et paragraphes", () => {
    render(<ProposalText markdown={"### Hors périmètre\n\n- Un\n- Deux\n\nPhrase."} />);
    expect(screen.getByRole("heading", { name: "Hors périmètre", level: 3 })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Phrase.")).toBeInTheDocument();
  });

  it("contenu hostile : ni balise, ni lien actif, ni image, tout en texte", () => {
    const { container } = render(<ProposalText markdown={HOSTILE} />);
    expect(container.querySelector("script, img, a, iframe")).toBeNull();
    expect(container.textContent).toContain("[cliquez](http://evil.example)");
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("tâches Markdown : le marqueur est retiré, le texte reste", () => {
    render(<ProposalText markdown={"- [ ] Rappel par SMS\n- [x] Agenda"} />);
    expect(screen.getByText("Rappel par SMS")).toBeInTheDocument();
    expect(screen.getByText("Agenda")).toBeInTheDocument();
  });
});
