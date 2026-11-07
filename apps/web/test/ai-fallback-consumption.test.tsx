import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  button,
  calls,
  openProviders,
  PRIMARY,
  pageText,
  provider,
  REPORT,
  SECOND,
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
/** Secours, consommation et plafond (S-ai-settings §3, décisions A1, B62, B126). */
const euros = (text: string) => text.replace(/\s/g, " ");

describe("secours", () => {
  it("interrupteur role=switch, texte dynamique selon l'état", async () => {
    await openProviders([PRIMARY, SECOND]);
    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(pageText()).toContain("Le secours est désactivé");
    await userEvent.click(toggle);
    await waitFor(() =>
      expect(calls(procedures.aiSettingsUpdate)).toEqual([{ fallbackEnabled: true }]),
    );
  });
  it("activé : « Si Anthropic répond en erreur ... la demande repart chez OpenAI »", async () => {
    procedures.aiSettingsGet.mockResolvedValue({ fallbackEnabled: true, usages: [] });
    await openProviders([PRIMARY, SECOND]);
    expect(
      await screen.findByText(
        /Si Anthropic répond en erreur ou atteint sa limite, la demande repart chez OpenAI/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });
  it("moins de deux fournisseurs : interrupteur désactivé avec explication", async () => {
    await openProviders([PRIMARY]);
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(pageText()).toContain("Ajoutez un deuxième fournisseur pour activer le secours.");
  });
  it("au-delà de deux fournisseurs : choix du fournisseur de secours", async () => {
    await openProviders([PRIMARY, SECOND, provider("mistral")]);
    const select = screen.getByLabelText("Fournisseur de secours");
    await userEvent.selectOptions(select, "mistral");
    await waitFor(() =>
      expect(calls(procedures.aiSettingsUpdate)).toEqual([{ fallback: "mistral" }]),
    );
  });
});

describe("consommation", () => {
  it("mois, total en euros estimé, une barre avec valeur en texte par fournisseur", async () => {
    await openProviders();
    expect(
      screen.getByRole("heading", { level: 3, name: "Consommation de novembre 2026" }),
    ).toBeInTheDocument();
    expect(euros(pageText())).toContain("≈ 12,40 €");
    expect(euros(pageText())).toMatch(/Anthropic.*8,10 €/);
    expect(euros(pageText())).toMatch(/OpenAI.*4,30 €/);
    expect(pageText()).toMatch(/45\s?000 jetons/);
  });
  it("plafond saisi en euros devient des micro-dollars", async () => {
    await openProviders();
    const field = screen.getByLabelText("Plafond mensuel (en euros)");
    await userEvent.type(field, "25,5");
    await userEvent.click(button("Enregistrer le plafond"));
    await waitFor(() =>
      expect(calls(procedures.aiSettingsUpdate)).toEqual([{ monthlyCapMicroUsd: 25_500_000 }]),
    );
  });
  it("champ vidé : plafond retiré (null)", async () => {
    procedures.aiUsageReport.mockResolvedValue({ ...REPORT, monthlyCapMicroUsd: 10_000_000 });
    await openProviders();
    const field = screen.getByLabelText("Plafond mensuel (en euros)") as HTMLInputElement;
    await waitFor(() => expect(field.value).toBe("10"));
    await userEvent.clear(field);
    await userEvent.click(button("Enregistrer le plafond"));
    await waitFor(() =>
      expect(calls(procedures.aiSettingsUpdate)).toEqual([{ monthlyCapMicroUsd: null }]),
    );
  });
  it.each(["0", "-3", "abc"])("%s est refusé sans appel", async (value) => {
    await openProviders();
    await userEvent.type(screen.getByLabelText("Plafond mensuel (en euros)"), value);
    await userEvent.click(button("Enregistrer le plafond"));
    expect(await screen.findByText(/supérieur à 0/)).toBeInTheDocument();
    expect(procedures.aiSettingsUpdate).not.toHaveBeenCalled();
  });
  it.each([
    ["warning", /80 %/],
    ["suspended", /Plafond atteint/],
  ])("état %s : message doublé d'une icône", async (capState, text) => {
    const base = {
      month: "2026-11",
      providers: [],
      totalCostMicroUsd: 8_000_000,
      monthlyCapMicroUsd: 10_000_000,
    };
    procedures.aiUsageReport.mockResolvedValue({ ...base, capState });
    await openProviders();
    const message = await screen.findByText(text);
    expect(
      message.closest("[role=status], [role=alert]")?.querySelector("svg[aria-hidden]"),
    ).not.toBeNull();
  });
});
