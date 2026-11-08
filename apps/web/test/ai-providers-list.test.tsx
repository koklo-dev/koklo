import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  button,
  calls,
  inRow,
  keyField,
  openProviders,
  PRIMARY,
  provider,
  SECOND,
  SECRET,
  SECRET_FRAGMENTS,
  serveProviders,
  surfaces,
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
/** Liste des fournisseurs (S-ai-settings §3, §5, §7) : pastilles, actions selon le rôle de la ligne, retrait confirmé. */
const OPENROUTER = provider("openrouter");
const INVALID = provider("google", { status: "invalid" });

describe("lignes", () => {
  it("pastilles Principal et Secours, nom accessible « Fournisseur X, principal, vérifiée »", async () => {
    await openProviders([PRIMARY, SECOND]);
    expect(
      screen.getByRole("listitem", { name: /^Fournisseur Anthropic, principal, vérifiée/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("listitem", { name: /^Fournisseur OpenAI, secours, vérifiée/ }),
    ).toBeInTheDocument();
    expect(inRow(/Anthropic/).getByText("Principal")).toBeInTheDocument();
    expect(inRow(/OpenAI/).getByText("Secours")).toBeInTheDocument();
  });
  it("OpenRouter : pastille Intermédiaire et note sur l'absence d'option UE", async () => {
    await openProviders([PRIMARY, OPENROUTER]);
    const line = inRow(/OpenRouter/);
    expect(line.getByText("Intermédiaire")).toBeInTheDocument();
    expect(line.getByText(/ne sont pas proposés|n'est pas proposé/)).toBeInTheDocument();
  });
  it("statut vérifiée avec date longue ; Refusée avec Remplacer en évidence", async () => {
    await openProviders([PRIMARY, INVALID]);
    expect(inRow(/Anthropic/).getByText(/Clé vérifiée le 2 novembre 2026/)).toBeInTheDocument();
    expect(inRow(/Google/).getByText("Refusée")).toBeInTheDocument();
    expect(inRow(/Google/).getByRole("button", { name: /Remplacer la clé/ })).toBeInTheDocument();
  });
  it("actions : le principal n'a ni « Mettre en principal » ni « Retirer »", async () => {
    await openProviders([PRIMARY, SECOND]);
    const first = inRow(/Anthropic/);
    expect(first.queryByRole("button", { name: /Mettre en principal/ })).not.toBeInTheDocument();
    expect(first.queryByRole("button", { name: /Retirer/ })).not.toBeInTheDocument();
    expect(first.getByRole("button", { name: /Vérifier/ })).toBeInTheDocument();
    const second = inRow(/OpenAI/);
    expect(second.getByRole("button", { name: /Mettre en principal/ })).toBeInTheDocument();
    expect(second.getByRole("button", { name: /Retirer/ })).toBeInTheDocument();
  });
});

describe("actions", () => {
  it("Vérifier : aiProvider.verify avec le fournisseur, annonce en toast", async () => {
    await openProviders([PRIMARY, SECOND]);
    await userEvent.click(inRow(/Anthropic/).getByRole("button", { name: /Vérifier/ }));
    await waitFor(() =>
      expect(calls(procedures.aiProviderVerify)).toEqual([{ provider: "anthropic" }]),
    );
    expect((await screen.findByText("Clé vérifiée.")).closest("[data-slot=toast]")).not.toBeNull();
  });
  it("Mettre en principal : confirmation courte puis aiProvider.setPrimary", async () => {
    await openProviders([PRIMARY, SECOND]);
    await userEvent.click(inRow(/OpenAI/).getByRole("button", { name: /Mettre en principal/ }));
    expect(
      screen.getByText(/OpenAI devient principal, Anthropic passe en secours/),
    ).toBeInTheDocument();
    expect(procedures.aiProviderSetPrimary).not.toHaveBeenCalled();
    await userEvent.click(button("Confirmer"));
    await waitFor(() =>
      expect(calls(procedures.aiProviderSetPrimary)).toEqual([{ provider: "openai" }]),
    );
  });
  it("Remplacer la clé : formulaire, aiProvider.replaceKey, clé vidée", async () => {
    await openProviders([PRIMARY, SECOND]);
    await userEvent.click(inRow(/Anthropic/).getByRole("button", { name: /Remplacer la clé/ }));
    await userEvent.click(keyField());
    await userEvent.paste(SECRET);
    await userEvent.click(button("Vérifier et remplacer"));
    await waitFor(() => expect(procedures.aiProviderReplaceKey).toHaveBeenCalled());
    expect(calls(procedures.aiProviderReplaceKey)[0]).toEqual({
      provider: "anthropic",
      apiKey: SECRET,
    });
    await waitFor(() => expect(screen.queryByLabelText(/^Clé [A-ZÀ-Ý]/)).not.toBeInTheDocument());
    for (const text of surfaces())
      for (const part of SECRET_FRAGMENTS) expect(text).not.toContain(part);
  });
});

describe("retrait", () => {
  it("confirmation en ligne : « Garder » au focus, Échap garde, aucun appel", async () => {
    await openProviders([PRIMARY, SECOND]);
    const trigger = inRow(/OpenAI/).getByRole("button", { name: /Retirer/ });
    await userEvent.click(trigger);
    const group = screen.getByRole("group", { name: /Confirmer le retrait/ });
    const keep = within(group).getByRole("button", { name: "Garder" });
    expect(keep).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("group", { name: /Confirmer le retrait/ })).not.toBeInTheDocument();
    expect(procedures.aiProviderRemove).not.toHaveBeenCalled();
  });
  it("Retirer confirme : aiProvider.remove", async () => {
    await openProviders([PRIMARY, SECOND]);
    await userEvent.click(inRow(/OpenAI/).getByRole("button", { name: /Retirer/ }));
    const group = screen.getByRole("group", { name: /Confirmer le retrait/ });
    await userEvent.click(within(group).getByRole("button", { name: "Retirer" }));
    await waitFor(() =>
      expect(calls(procedures.aiProviderRemove)).toEqual([{ provider: "openai" }]),
    );
  });
});
