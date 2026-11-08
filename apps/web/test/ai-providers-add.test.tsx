import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ADD_BUTTON,
  addProvider,
  button,
  calls,
  keyField,
  openAddForm,
  openProviders,
  PRIMARY,
  pageText,
  provider,
  SECOND,
  SECRET,
  SECRET_FRAGMENTS,
  SUBMIT,
  serveProviders,
  surfaces,
} from "./support/ai-providers.tsx";
import { apiError, polyfillRadix, procedures, resetWebMocks } from "./support/web-mocks.ts";

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

/** Ajout guidé (S-ai-settings §2, §5, décisions B122, B123) : test avant enregistrement, clé jamais gardée. */
const OWNED = [PRIMARY];

describe("choix du fournisseur", () => {
  it("six cartes radio dans un radiogroup ; les fournisseurs déjà ajoutés sont absents", async () => {
    await openProviders([]);
    expect(screen.getAllByRole("radio")).toHaveLength(6);
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
  });
  it("avec Anthropic déjà ajouté : cinq cartes, sans Anthropic", async () => {
    await openProviders(OWNED);
    await openAddForm();
    expect(screen.getAllByRole("radio")).toHaveLength(5);
    expect(screen.queryByRole("radio", { name: /Anthropic/ })).not.toBeInTheDocument();
  });
  it("le bouton « Ajouter un fournisseur » porte aria-expanded", async () => {
    await openProviders(OWNED);
    expect(button(ADD_BUTTON)).toHaveAttribute("aria-expanded", "false");
    await openAddForm();
    expect(button(ADD_BUTTON)).toHaveAttribute("aria-expanded", "true");
  });
});

describe("champs", () => {
  it("clé : type=password, autocomplete=off, maxLength=512, non contrôlé", async () => {
    await openProviders([]);
    await userEvent.click(screen.getByRole("radio", { name: /Anthropic/ }));
    const field = keyField();
    expect(field).toHaveAttribute("type", "password");
    expect(field).toHaveAttribute("autocomplete", "off");
    expect(field).toHaveAttribute("maxlength", "512");
  });
  it("adresse de l'API seulement pour Compatible OpenAI", async () => {
    await openProviders([]);
    expect(screen.queryByLabelText("Adresse de l'API")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: /Compatible OpenAI/ }));
    expect(screen.getByLabelText("Adresse de l'API")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: /Mistral/ }));
    expect(screen.queryByLabelText("Adresse de l'API")).not.toBeInTheDocument();
  });
  it("« Modèle à utiliser » seulement sans modèle qualifié (B123)", async () => {
    await openProviders([]);
    await userEvent.click(screen.getByRole("radio", { name: /Anthropic/ }));
    expect(screen.queryByLabelText("Modèle à utiliser")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: /Mistral/ }));
    expect(screen.getByLabelText("Modèle à utiliser")).toBeInTheDocument();
  });
});

describe("envoi", () => {
  it("succès : aiProvider.add reçoit la clé, champ vidé, ligne ajoutée, annonce role=status", async () => {
    await openProviders(OWNED);
    await openAddForm();
    procedures.aiProviderList.mockResolvedValue({ items: [PRIMARY, provider("mistral")] });
    await userEvent.click(screen.getByRole("radio", { name: /Mistral/ }));
    await userEvent.type(screen.getByLabelText("Modèle à utiliser"), "mistral-test");
    await userEvent.click(keyField());
    await userEvent.paste(SECRET);
    await userEvent.click(button(SUBMIT));
    await waitFor(() => expect(procedures.aiProviderAdd).toHaveBeenCalledTimes(1));
    expect(calls(procedures.aiProviderAdd)[0]).toEqual({
      provider: "mistral",
      apiKey: SECRET,
      model: "mistral-test",
    });
    expect(await screen.findByRole("listitem", { name: /Mistral/ })).toBeInTheDocument();
    expect(
      (await screen.findByText("Fournisseur ajouté et vérifié.")).closest("[data-slot=toast]"),
    ).not.toBeNull();
    for (const text of surfaces())
      for (const part of SECRET_FRAGMENTS) expect(text).not.toContain(part);
  });
  it("échec du test : erreur sans nom de fournisseur, focus sur l'alerte, rien ajouté, clé vidée", async () => {
    procedures.aiProviderAdd.mockRejectedValue(apiError("LLM_PROVIDER_ERROR", { reason: "auth" }));
    await openProviders([]);
    await addProvider("Anthropic");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("n'a pas été enregistrée");
    expect(alert.textContent).not.toMatch(/Anthropic|OpenAI|Mistral|Google|OpenRouter/);
    await waitFor(() => expect(alert).toHaveFocus());
    expect(keyField().value).toBe("");
    expect(screen.queryByRole("listitem", { name: /Anthropic/ })).not.toBeInTheDocument();
    for (const text of surfaces())
      for (const part of SECRET_FRAGMENTS) expect(text).not.toContain(part);
  });
  it("test en cours : bouton désactivé et aria-busy", async () => {
    procedures.aiProviderAdd.mockReturnValue(new Promise(() => undefined));
    await openProviders([]);
    await addProvider("Anthropic");
    const busy = await screen.findByRole("button", { name: /Vérification/ });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
  });
});

describe("envoi : garde-fous", () => {
  it("clé absente du cache React Query après succès comme après échec", async () => {
    const { client } = await openProviders([]);
    await addProvider("Anthropic");
    await waitFor(() => expect(procedures.aiProviderAdd).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));
    const dump = JSON.stringify([
      client
        .getMutationCache()
        .getAll()
        .map((m) => m.state.variables ?? null),
      client
        .getQueryCache()
        .getAll()
        .map((q) => q.state.data ?? null),
    ]);
    expect(dump).not.toContain("FAKE-KEY");
  });
  it("adresse requise pour Compatible OpenAI et transmise", async () => {
    await openProviders([]);
    await userEvent.click(screen.getByRole("radio", { name: /Compatible OpenAI/ }));
    await userEvent.type(screen.getByLabelText("Adresse de l'API"), "https://api.example.test/v1");
    await userEvent.type(screen.getByLabelText("Modèle à utiliser"), "modele-test");
    await userEvent.click(keyField());
    await userEvent.paste(SECRET);
    await userEvent.click(button(SUBMIT));
    await waitFor(() => expect(procedures.aiProviderAdd).toHaveBeenCalled());
    expect(calls(procedures.aiProviderAdd)[0]).toMatchObject({
      provider: "openai_compatible",
      baseUrl: "https://api.example.test/v1",
    });
  });
  it("clé vide : message et aucun appel", async () => {
    await openProviders([]);
    await userEvent.click(screen.getByRole("radio", { name: /Anthropic/ }));
    await userEvent.click(button(SUBMIT));
    expect(await screen.findByText("Saisissez la clé.")).toBeInTheDocument();
    expect(procedures.aiProviderAdd).not.toHaveBeenCalled();
    expect(pageText()).not.toContain(SECOND.provider);
  });
});
