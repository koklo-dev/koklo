import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  calls,
  openProviders,
  PRIMARY,
  provider,
  serveProviders,
} from "./support/ai-providers.tsx";
import { polyfillRadix, procedures, resetWebMocks } from "./support/web-mocks.ts";

vi.mock("next/navigation", async () => {
  const m = await import("./support/web-mocks.ts");
  return { useRouter: () => m.router, usePathname: () => m.pathname.current };
});
vi.mock("../src/lib/auth-client.ts", async () => ({
  authClient: (await import("./support/web-mocks.ts")).authClient,
}));
vi.mock("../src/lib/orpc.ts", async () => ({
  orpc: (await import("./support/web-mocks.ts")).orpc,
}));

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  localStorage.clear();
  serveProviders("owner");
});
/** Modèle par usage (S-ai-settings §3, §7) : « Changer » ouvre une listbox des modèles qualifiés, au clavier. */
const USAGE = /Cadrage de l'idée/;
const usageRow = () => screen.getByRole("listitem", { name: USAGE });

describe("modèle par usage", () => {
  it("quatre usages ; modèle par défaut quand rien n'est choisi", async () => {
    await openProviders();
    expect(screen.getAllByRole("button", { name: /^Changer/ })).toHaveLength(4);
    expect(within(usageRow()).getByText(/Modèle par défaut/)).toBeInTheDocument();
  });
  it("Changer : aria-expanded, listbox, options aria-selected, badge économique", async () => {
    await openProviders();
    const change = within(usageRow()).getByRole("button", { name: /^Changer/ });
    expect(change).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(change);
    expect(change).toHaveAttribute("aria-expanded", "true");
    const list = screen.getByRole("listbox");
    const options = within(list).getAllByRole("option");
    expect(options.length).toBe(4);
    expect(options.filter((o) => o.getAttribute("aria-selected") === "true")).toHaveLength(1);
    expect(within(list).getByText("économique")).toBeInTheDocument();
    expect(within(list).getByRole("option", { name: /claude-test-haiku/ })).toBeInTheDocument();
  });
  it("le focus arrive sur l'option sélectionnée ; flèches déplacent ; Échap ferme et rend le focus", async () => {
    await openProviders();
    const change = within(usageRow()).getByRole("button", { name: /^Changer/ });
    await userEvent.click(change);
    const options = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(options[0]).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(options[1]).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(change).toHaveFocus();
    expect(procedures.aiUsageSet).not.toHaveBeenCalled();
  });
  it("Entrée sur un modèle : aiUsage.set avec fournisseur et modèle", async () => {
    await openProviders();
    await userEvent.click(within(usageRow()).getByRole("button", { name: /^Changer/ }));
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await waitFor(() =>
      expect(calls(procedures.aiUsageSet)).toEqual([
        { usage: "idea_space", provider: "anthropic", model: "claude-test-sonnet" },
      ]),
    );
  });
  it("« Modèle par défaut » envoie model: null", async () => {
    await openProviders();
    await userEvent.click(within(usageRow()).getByRole("button", { name: /^Changer/ }));
    await userEvent.click(screen.getByRole("option", { name: /Modèle par défaut/ }));
    await waitFor(() =>
      expect(calls(procedures.aiUsageSet)).toEqual([{ usage: "idea_space", model: null }]),
    );
  });
  it("les modèles d'un fournisseur sans clé valide ne sont pas proposés", async () => {
    await openProviders([PRIMARY, provider("openai", { role: "fallback", status: "invalid" })]);
    await userEvent.click(within(usageRow()).getByRole("button", { name: /^Changer/ }));
    expect(screen.queryByRole("option", { name: /gpt-test-1/ })).not.toBeInTheDocument();
  });
});
