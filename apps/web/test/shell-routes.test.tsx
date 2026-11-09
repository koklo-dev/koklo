import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** TK-88 (C3, C4, C5, C7) : pages serveur de la coquille — redirections, « Bientôt », Réglages, 404. */
const redirect = vi.hoisted(() =>
  vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
);
const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);
const lastProjectPath = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  redirect,
  notFound,
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
const headers = vi.hoisted(() => vi.fn(async () => new Headers({ cookie: "sid=1" })));
vi.mock("next/headers", () => ({ headers }));
vi.mock("../src/lib/last-project.ts", () => ({ lastProjectPath }));
vi.mock("../src/lib/orpc.ts", async () => ({
  orpc: (await import("./support/web-mocks.ts")).orpc,
}));
vi.mock("../src/lib/auth-client.ts", async () => ({
  authClient: (await import("./support/web-mocks.ts")).authClient,
}));

const ID = "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b01";
const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

beforeEach(() => {
  vi.stubEnv("API_INTERNAL_URL", "http://api.internal:3001");
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("APP_VERSION", "0.0.0");
  redirect.mockClear();
  notFound.mockClear();
  lastProjectPath.mockReset();
});

describe("/ et /kanban (C3)", () => {
  it("/ ouvre le dernier projet ouvert", async () => {
    lastProjectPath.mockResolvedValue(`/projects/${ID}`);
    const { default: Home } = await import("../src/app/page.tsx");
    await expect(Home()).rejects.toThrow(`NEXT_REDIRECT:/projects/${ID}`);
    expect(lastProjectPath).toHaveBeenCalledWith("http://api.internal:3001", "sid=1");
  });

  it("/ et /kanban lisent les en-têtes avant la configuration : jamais préparées au build (sans configuration d'exécution)", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("API_INTERNAL_URL", "");
    headers.mockRejectedValueOnce(new Error("DYNAMIC_SERVER_USAGE"));
    const { default: Home } = await import("../src/app/page.tsx");
    await expect(Home()).rejects.toThrow("DYNAMIC_SERVER_USAGE");
    headers.mockRejectedValueOnce(new Error("DYNAMIC_SERVER_USAGE"));
    const { default: Kanban } = await import("../src/app/kanban/page.tsx");
    await expect(Kanban()).rejects.toThrow("DYNAMIC_SERVER_USAGE");
  });

  it("/ sans visite renvoie vers /projects", async () => {
    lastProjectPath.mockResolvedValue("/projects");
    const { default: Home } = await import("../src/app/page.tsx");
    await expect(Home()).rejects.toThrow("NEXT_REDIRECT:/projects");
  });

  it("/kanban ouvre les tickets du dernier projet ouvert", async () => {
    lastProjectPath.mockResolvedValue(`/projects/${ID}/tickets`);
    const { default: Kanban } = await import("../src/app/kanban/page.tsx");
    await expect(Kanban()).rejects.toThrow(`NEXT_REDIRECT:/projects/${ID}/tickets`);
    expect(lastProjectPath).toHaveBeenCalledWith("http://api.internal:3001", "sid=1", "/tickets");
  });
});

describe("/projects/<id> (C4, TK-92)", () => {
  it("est la vue d'ensemble : plus de redirection vers le cahier fonctionnel", async () => {
    const { default: Page } = await import("../src/app/(shell)/projects/[projectId]/page.tsx");
    const element = (await Page(params({ projectId: ID }))) as { props: { projectId: string } };
    expect(redirect).not.toHaveBeenCalled();
    expect(element.props).toEqual({ projectId: ID });
  });

  it("/projects/<id>/activity est la page d'activité", async () => {
    const { default: Page } = await import(
      "../src/app/(shell)/projects/[projectId]/activity/page.tsx"
    );
    const element = (await Page(params({ projectId: ID }))) as { props: { projectId: string } };
    expect(element.props).toEqual({ projectId: ID });
  });
});

describe("pages « Bientôt » (C4)", () => {
  it("l'Idée est l'écran du dossier d'idée (TK-89), plus une page « Bientôt »", async () => {
    const { default: Page } = await import("../src/app/(shell)/projects/[projectId]/idea/page.tsx");
    const element = (await Page(params({ projectId: ID }))) as {
      props: { children: { props: { projectId: string } } };
    };
    expect(element.props.children.props).toEqual({ projectId: ID });
  });

  it.each(["data", "architecture", "technical", "security", "design", "quality"])(
    "spec/%s est une page « Bientôt »",
    async (slug) => {
      const { default: Page } = await import(
        "../src/app/(shell)/projects/[projectId]/spec/[slug]/page.tsx"
      );
      const element = await Page(params({ projectId: ID, slug }));
      expect(element).toMatchObject({ props: { projectId: ID, slug } });
    },
  );

  it.each(["inconnu", "functional-x", "Data"])("spec/%s : 404", async (slug) => {
    const { default: Page } = await import(
      "../src/app/(shell)/projects/[projectId]/spec/[slug]/page.tsx"
    );
    await expect(Page(params({ projectId: ID, slug }))).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("pages d'un projet", () => {
  it("spec/functional : cahier fonctionnel du projet de l'URL", async () => {
    const { default: Page } = await import(
      "../src/app/(shell)/projects/[projectId]/spec/functional/page.tsx"
    );
    expect(await Page(params({ projectId: ID }))).toMatchObject({ props: { projectId: ID } });
  });

  it("tickets : kanban du projet de l'URL (plus de « premier projet », B75)", async () => {
    const { default: Page } = await import(
      "../src/app/(shell)/projects/[projectId]/tickets/page.tsx"
    );
    expect(await Page(params({ projectId: ID }))).toMatchObject({ props: { projectId: ID } });
  });

  it("framing : assistant de cadrage du projet de l'URL", async () => {
    const { default: Page } = await import(
      "../src/app/(shell)/projects/[projectId]/framing/page.tsx"
    );
    expect(await Page(params({ projectId: ID }))).toMatchObject({ props: { projectId: ID } });
  });
});

describe("Réglages (C7)", () => {
  it("/settings → /settings/members", async () => {
    const { default: Page } = await import("../src/app/(shell)/settings/page.tsx");
    expect(() => Page()).toThrow("NEXT_REDIRECT:/settings/members");
  });

  it.each(["general", "members", "github", "ai", "account"])(
    "/settings/%s rend la section",
    async (section) => {
      const { default: Page } = await import("../src/app/(shell)/settings/[section]/page.tsx");
      const element = await Page({
        ...params({ section }),
        searchParams: Promise.resolve({ result: "installed" }),
      });
      expect(element).toMatchObject({ props: { section } });
    },
  );

  it("/settings/github transmet le résultat connu du retour GitHub, ignore le reste", async () => {
    const { default: Page } = await import("../src/app/(shell)/settings/[section]/page.tsx");
    const known = await Page({
      ...params({ section: "github" }),
      searchParams: Promise.resolve({ result: "installed" }),
    });
    expect(known).toMatchObject({ props: { githubResult: "installed" } });
    const unknown = await Page({
      ...params({ section: "github" }),
      searchParams: Promise.resolve({ result: "n-importe-quoi" }),
    });
    expect((unknown as { props: { githubResult?: string } }).props.githubResult).toBeUndefined();
  });

  it.each(["inconnue", "Members", "ai2"])("section %s : 404", async (section) => {
    const { default: Page } = await import("../src/app/(shell)/settings/[section]/page.tsx");
    await expect(
      Page({ ...params({ section }), searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("titres de page par section", async () => {
    const { generateMetadata } = await import("../src/app/(shell)/settings/[section]/page.tsx");
    expect(await generateMetadata(params({ section: "members" }))).toMatchObject({
      title: "Membres · Réglages · Koklo",
    });
    expect(await generateMetadata(params({ section: "ai" }))).toMatchObject({
      title: "Fournisseurs d'IA · Réglages · Koklo",
    });
    expect(await generateMetadata(params({ section: "account" }))).toMatchObject({
      title: "Mon compte · Réglages · Koklo",
    });
  });
});

describe("rendu de la page « Bientôt » (C4)", () => {
  it("EmptyState « Bientôt », h1 du livrable, aucun lien mort ni action", async () => {
    const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
    const mocks = await import("./support/web-mocks.ts");
    mocks.resetWebMocks();
    const { SoonPage } = await import("../src/components/soon-page.tsx");
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SoonPage projectId={ID} slug="data" />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("heading", { level: 1, name: "Données" })).toBeInTheDocument();
    expect(screen.getByText("Bientôt")).toBeInTheDocument();
    expect(
      screen.getByText("Le cahier des données arrive dans une prochaine version."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
