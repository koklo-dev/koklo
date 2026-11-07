import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Providers } from "../src/components/providers.tsx";

describe("Providers", () => {
  it("rend ses enfants", () => {
    render(
      <Providers>
        <p>enfant</p>
      </Providers>,
    );
    expect(screen.getByText("enfant")).toBeInTheDocument();
  });
});
