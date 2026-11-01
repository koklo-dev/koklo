import { configure, screen, within } from "@testing-library/react";
import { FeaturesPage } from "../../src/components/features-page.tsx";
import { asRole } from "./github-fixtures.ts";
import { renderWithQuery } from "./render.tsx";
import { findRole } from "./wait.ts";
import { ORG_ID, procedures, setUrl } from "./web-mocks.ts";

/**
 * Support des tests de la liste des fonctionnalités (TK-48 / 48d). Les `vi.mock` restent dans chaque fichier :
 * `next/navigation` (avec `useSearchParams` de web-mocks), `auth-client` et `orpc`, voir .workflow/TK-48/03-red-48d.md.
 */
// Les attentes asynchrones (`waitFor`, `findBy*`) de ces tests valent 1 s par défaut, ce qui est trop court
// pour le premier rendu d'une page chargée par React Query sur un runner saturé (CI + couverture). Le délai
// n'est relevé que pour les fichiers qui importent ce support ; une attente qui réussit n'en est pas ralentie.
configure({ asyncUtilTimeout: 5_000 });

/** Propriétaire des brouillons locaux : le compte `u1` des simulations et son organisation active. */
export const SCOPE = { userId: "u1", organizationId: ORG_ID };
export const PROJECT_ID = "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b01";
export const OTHER_PROJECT_ID = "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b02";
export const SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
export const SHORT_SHA = "a1b2c3d";
export const PROJECT = { id: PROJECT_ID, name: "Alpha" };
export const INSTALLATION_ID = "01900000-0000-7000-8000-0000000000e1";

export const head = (over: Record<string, unknown> = {}) => ({
  branch: "main",
  commitSha: SHA,
  status: "ready",
  errorCode: null,
  indexedAt: "2026-10-30T12:00:00.000Z",
  counts: { features: 3, tables: 2, endpoints: 4 },
  ...over,
});

export const featureId = (n: number): string => `F-${String(n).padStart(3, "0")}`;

export const summary = (n: number, over: Record<string, unknown> = {}) => ({
  specId: featureId(n),
  title: `Fonctionnalité numéro ${n}`,
  status: "specifiee",
  priority: "must",
  filePath: `.koklo/features/${featureId(n)}.yaml`,
  criteriaCount: 2,
  ...over,
});

/** Trois fonctionnalités couvrant plusieurs statuts, priorités et nombres de critères. */
export const FEATURES = [
  summary(1, {
    title: "Connexion par e-mail",
    status: "brouillon",
    priority: "must",
    criteriaCount: 3,
  }),
  summary(2, {
    title: "Tableau kanban",
    status: "implementee",
    priority: "should",
    criteriaCount: 1,
  }),
  summary(3, {
    title: "Export des tickets",
    status: "adoptee",
    priority: "wont",
    criteriaCount: 0,
  }),
];

export const DETAIL = {
  specId: "F-001",
  title: "Connexion par e-mail",
  status: "brouillon",
  priority: "must",
  description: "Première ligne.\n\nSeconde ligne avec **du gras** et <b>du html</b>.",
  criteria: [
    {
      specId: "AC-1",
      position: 1,
      title: "Connexion réussie",
      steps: [
        { type: "etant_donne", text: "un compte existant" },
        { type: "quand", text: "la personne saisit son adresse" },
        { type: "alors", text: "elle accède à ses projets" },
        { type: "et", text: "un message de bienvenue s'affiche" },
      ],
    },
    { specId: "AC-2", position: 2, title: "Adresse inconnue", steps: [] },
  ],
  tables: ["T-user"],
  endpoints: ["E-login"],
  screens: ["S-login"],
  roles: ["RL-owner"],
  rules: ["R-001"],
  nfr: ["NFR-latence"],
  filePath: ".koklo/features/F-001.yaml",
  commitSha: SHA,
};

/** Une page de `count` fonctionnalités à partir du numéro `from`. */
export const page = (from: number, count: number, nextCursor: string | null = null) => ({
  items: Array.from({ length: count }, (_, i) => summary(from + i)),
  nextCursor,
});

export type Role = "owner" | "admin" | "dev" | "designer" | "client" | "business";
export const TEAM: Role[] = ["owner", "admin", "dev", "designer"];
export const CLIENT_SIDE: Role[] = ["client", "business"];

/**
 * Pose le rôle, le projet « Alpha » et une spec lue (`spec.head` prêt, trois fonctionnalités). Chaque test
 * surcharge ensuite ce qui l'intéresse (`procedures.specHead.mockResolvedValue(...)`, etc.).
 */
export function serve(role: Role = "owner"): void {
  asRole(role);
  procedures.projectList.mockResolvedValue([PROJECT]);
  procedures.specHead.mockResolvedValue(head());
  procedures.specListFeatures.mockResolvedValue({ items: FEATURES, nextCursor: null });
  procedures.specGetFeature.mockResolvedValue(DETAIL);
  procedures.repoList.mockResolvedValue([]);
}

export interface RenderOptions {
  projectId?: string;
  /** Query string de l'adresse au chargement (avec ou sans « ? »). */
  search?: string;
}

export function renderFeatures({ projectId = PROJECT_ID, search = "" }: RenderOptions = {}) {
  const query = search && !search.startsWith("?") ? `?${search}` : search;
  setUrl(`/projects/${projectId}/features${query}`);
  return renderWithQuery(<FeaturesPage projectId={projectId} />);
}

/** Attend que la table des fonctionnalités soit affichée. */
export const findTable = (): Promise<HTMLElement> =>
  findRole("table", { name: /^Fonctionnalités du projet/ });

export const titleLink = (title: string): HTMLElement => screen.getByRole("link", { name: title });

/** Entrées reçues par une procédure simulée (premier argument de chaque appel). */
export const inputsOf = (fn: { mock: { calls: unknown[][] } }): Array<Record<string, unknown>> =>
  fn.mock.calls.map((call) => (call[0] ?? {}) as Record<string, unknown>);

/** Texte visible de la page, sans le gabarit : sert aux contrôles de vocabulaire. */
export const visibleText = (root: HTMLElement = document.body): string =>
  (root.textContent ?? "").replace(/\s+/g, " ");

/**
 * Vocabulaire interdit au client (vision §1 principe 7, AC-48-28) : git, version, chemin, code technique.
 * « Mise à jour le » est permis ; « Version de la spec » ne l'est pas.
 */
export const GIT_VOCABULARY =
  /commit|branche|branch|\bSHA\b|a1b2c3d|version de la spec|\.ya?ml|\.koklo|features\/|spec_too_large|\bindex|repository|d[ée]p[oô]t git|OAuth|token|jeton|SPEC_INDEX_FAILED|PROVIDER_/i;

/** Région d'état unique de l'écran. */
export const statusRegion = (): HTMLElement => screen.getByRole("status");

export { within };
