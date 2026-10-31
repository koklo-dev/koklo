import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createWithSpecFailure,
  rejectWith,
  renderProjects,
  setupCreation,
} from "./support/project-create.tsx";
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

const TOKEN_TEXT =
  "Pour créer un dépôt sur le compte acme-corp, Koklo a besoin de votre autorisation. Vous serez redirigé vers GitHub, puis ramené ici.";
const forbidden = (reason: string) =>
  rejectWith("REPO_CREATION_FORBIDDEN", {
    reason,
    ownerLogin: "acme-corp",
    ownerKind: "organization",
  });

type Action = string | RegExp;
interface Case {
  label: string;
  error: () => Promise<never>;
  text: string;
  buttons: Action[];
  absent: Action[];
}

/** Une ligne par code du tableau d'erreurs de design/screens/S-projects.md §4.1 (AC-48-21). */
const CASES: Case[] = [
  {
    label: "503 PROVIDER_UNAVAILABLE",
    error: rejectWith("PROVIDER_UNAVAILABLE"),
    text: "GitHub ne répond pas, ou l'application GitHub n'est pas configurée sur cet environnement. Votre projet est enregistré ; réessayez plus tard.",
    buttons: ["Réessayer", "Fermer"],
    absent: [/Autoriser/, /Réautoriser/],
  },
  {
    label: "403 USER_TOKEN_REQUIRED",
    error: rejectWith("USER_TOKEN_REQUIRED", { ownerLogin: "acme-corp" }),
    text: TOKEN_TEXT,
    buttons: ["Autoriser Koklo sur acme-corp", "Fermer"],
    absent: ["Réessayer"],
  },
  {
    label: "403 REPO_CREATION_FORBIDDEN missing-user-token",
    error: forbidden("missing-user-token"),
    text: TOKEN_TEXT,
    buttons: ["Autoriser Koklo sur acme-corp", "Fermer"],
    absent: ["Réessayer"],
  },
  {
    label: "403 REPO_CREATION_FORBIDDEN resource-not-accessible",
    error: forbidden("resource-not-accessible"),
    text: "GitHub refuse la création d'un dépôt sur acme-corp. L'application GitHub n'a pas le droit d'y créer des dépôts : un propriétaire de ce compte doit le lui accorder dans les paramètres GitHub, ou vous pouvez choisir un autre compte.",
    buttons: ["Réessayer", "Fermer"],
    absent: [/Autoriser/],
  },
  {
    label: "403 PROVIDER_AUTH_EXPIRED kind user",
    error: rejectWith("PROVIDER_AUTH_EXPIRED", { kind: "user", refreshable: false }),
    text: "Votre autorisation Koklo sur GitHub a expiré.",
    buttons: ["Réautoriser Koklo sur acme-corp", "Fermer"],
    absent: ["Réessayer"],
  },
  {
    label: "403 PROVIDER_AUTH_EXPIRED kind installation",
    error: rejectWith("PROVIDER_AUTH_EXPIRED", { kind: "installation", refreshable: false }),
    text: "L'accès de Koklo à ce compte GitHub a expiré. Réinstallez l'application depuis la page GitHub, puis revenez réessayer.",
    buttons: ["Réessayer", "Fermer"],
    absent: [/Autoriser/],
  },
  {
    label: "429 PROVIDER_RATE_LIMITED 1500 ms",
    error: rejectWith("PROVIDER_RATE_LIMITED", { retryAfterMs: 1500 }),
    text: "GitHub limite temporairement les demandes. Réessayez dans environ 2 secondes.",
    buttons: ["Réessayer", "Fermer"],
    absent: [],
  },
  {
    label: "429 PROVIDER_RATE_LIMITED sans délai",
    error: rejectWith("PROVIDER_RATE_LIMITED", {}),
    text: "GitHub limite temporairement les demandes. Réessayez dans un instant.",
    buttons: ["Réessayer", "Fermer"],
    absent: [],
  },
  {
    label: "404 NOT_FOUND",
    error: rejectWith("NOT_FOUND"),
    text: "Ce compte GitHub n'est plus disponible. Choisissez-en un autre ou relancez la liste.",
    buttons: ["Réessayer", "Fermer"],
    absent: [],
  },
  {
    label: "403 FORBIDDEN",
    error: rejectWith("FORBIDDEN"),
    text: "Vous n'avez plus le droit de créer un dépôt. Le projet est créé : demandez à un propriétaire ou à un administrateur de relier le dépôt.",
    buttons: ["Fermer"],
    absent: ["Réessayer"],
  },
  {
    label: "INTERNAL",
    error: rejectWith("INTERNAL"),
    text: "Le dépôt de spec n'a pas pu être créé. Une erreur est survenue. Vérifiez votre connexion puis réessayez. Si le dépôt a pu être créé malgré tout, « Réessayer » le détectera.",
    buttons: ["Réessayer", "Fermer"],
    absent: [],
  },
  {
    label: "erreur réseau",
    error: () => Promise.reject(new TypeError("Failed to fetch")),
    text: "Le dépôt de spec n'a pas pu être créé. Une erreur est survenue. Vérifiez votre connexion puis réessayez. Si le dépôt a pu être créé malgré tout, « Réessayer » le détectera.",
    buttons: ["Réessayer", "Fermer"],
    absent: [],
  },
];

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  setupCreation();
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Erreurs typées de repo.createSpec (AC-48-21)", () => {
  it.each(CASES)("$label : titre fixe, texte du tableau, bonnes actions", async (c) => {
    renderProjects();
    const sheet = await createWithSpecFailure(c.error);
    const alert = within(sheet).getByRole("alert");
    expect(alert).toHaveTextContent("Projet créé, dépôt de spec non créé");
    expect(alert).toHaveTextContent(c.text);
    for (const name of c.buttons) {
      expect(within(sheet).getByRole("button", { name })).toBeEnabled();
    }
    for (const name of c.absent) {
      expect(within(sheet).queryByRole("button", { name })).not.toBeInTheDocument();
    }
    expect(procedures.projectCreate).toHaveBeenCalledTimes(1);
  });

  it("autorisation d'installation expirée : lien « Ouvrir la page GitHub » vers /github", async () => {
    renderProjects();
    const sheet = await createWithSpecFailure(
      rejectWith("PROVIDER_AUTH_EXPIRED", { kind: "installation", refreshable: false }),
    );
    expect(within(sheet).getByRole("link", { name: "Ouvrir la page GitHub" })).toHaveAttribute(
      "href",
      "/github",
    );
  });

  it("429 : « Réessayer » n'est jamais désactivé par une minuterie", async () => {
    renderProjects();
    const sheet = await createWithSpecFailure(
      rejectWith("PROVIDER_RATE_LIMITED", { retryAfterMs: 60_000 }),
    );
    expect(within(sheet).getByRole("button", { name: "Réessayer" })).toBeEnabled();
  });

  it("404 NOT_FOUND : la liste des comptes est rechargée", async () => {
    renderProjects();
    const sheet = await createWithSpecFailure(rejectWith("NOT_FOUND"));
    await waitFor(() =>
      expect(procedures.installationList.mock.calls.length).toBeGreaterThanOrEqual(2),
    );
    expect(within(sheet).getByRole("alert")).toBeInTheDocument();
  });

  it("repo_name_taken avec un nom saisi : texte nommant le dépôt et le compte, focus sur « Nom du dépôt »", async () => {
    renderProjects();
    const sheet = await createWithSpecFailure(
      rejectWith("CONFLICT", { reason: "repo_name_taken" }),
      "mon-depot",
    );
    expect(within(sheet).getByRole("alert")).toHaveTextContent(
      "Un dépôt nommé « mon-depot » existe déjà sur acme-corp. Il peut venir d'une tentative précédente. Choisissez un autre nom puis réessayez, ou reliez ce dépôt s'il est déjà prêt.",
    );
    expect(within(sheet).getByLabelText("Nom du dépôt (facultatif)")).toHaveFocus();
    expect(within(sheet).getByRole("button", { name: "Réessayer" })).toBeEnabled();
  });

  it("repo_name_taken avec le champ vide : « Le nom proposé par défaut est déjà pris sur acme-corp. »", async () => {
    renderProjects();
    const sheet = await createWithSpecFailure(
      rejectWith("CONFLICT", { reason: "repo_name_taken" }),
    );
    expect(within(sheet).getByRole("alert")).toHaveTextContent(
      "Le nom proposé par défaut est déjà pris sur acme-corp.",
    );
    expect(within(sheet).getByLabelText("Nom du dépôt (facultatif)")).toHaveFocus();
  });

  it("VALIDATION sur name : erreur sous le champ (aria-invalid, focus), titre fixe conservé, pas de seconde alerte", async () => {
    renderProjects();
    const sheet = await createWithSpecFailure(
      rejectWith("VALIDATION", { field: "name", message: "invalid" }),
    );
    const field = within(sheet).getByLabelText("Nom du dépôt (facultatif)");
    expect(
      within(sheet).getByText(
        "Utilisez uniquement des lettres, chiffres, points, tirets et tirets bas (100 caractères maximum).",
      ),
    ).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveFocus();
    expect(within(sheet).getAllByRole("alert")).toHaveLength(1);
    expect(within(sheet).getByRole("button", { name: "Réessayer" })).toBeEnabled();
  });

  it("aucune valeur brute (message d'erreur, jeton) n'est rendue", async () => {
    const secret = "ghu_SECRET_VALUE_123";
    renderProjects();
    await createWithSpecFailure(() =>
      Promise.reject(Object.assign(new Error(secret), { code: "INTERNAL", data: { secret } })),
    );
    expect(document.body.textContent).not.toContain(secret);
    expect(screen.getByRole("dialog").innerHTML).not.toContain(secret);
  });
});
