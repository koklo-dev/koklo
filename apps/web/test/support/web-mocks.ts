import { useSyncExternalStore } from "react";
import { type Mock, vi } from "vitest";

/**
 * Frontières externes simulées pour les tests des écrans TK-24 : navigation Next, client Better Auth,
 * client oRPC. Les composants ne doivent appeler, sur chaque procédure oRPC, que `queryOptions` et
 * `mutationOptions` (+ `key` pour invalider) ; l'organisation active et la session viennent de
 * `authClient.getSession()` / `authClient.useSession()`.
 */

export const router = { replace: vi.fn(), push: vi.fn(), refresh: vi.fn() };
export const pathname = { current: "/projects" };

export const getSession = vi.fn();
export const setActive = vi.fn();
export const signOut = vi.fn();
export const getInvitation = vi.fn();
export const acceptInvitation = vi.fn();
export const listOrganizations = vi.fn();

export const authClient = {
  getSession,
  signOut,
  signIn: { social: vi.fn() },
  organization: { setActive, getInvitation, acceptInvitation, list: listOrganizations },
  useSession: () => ({
    data: { user: { id: "u1", name: "Awa Koné", email: "awa@example.com", image: null } },
    isPending: false,
  }),
};

export const procedures = {
  organizationList: vi.fn(),
  organizationCreate: vi.fn(),
  memberList: vi.fn(),
  memberInvite: vi.fn(),
  projectList: vi.fn(),
  projectCreate: vi.fn(),
  sprintList: vi.fn(),
  ticketList: vi.fn(),
  ticketTransition: vi.fn(),
  installationList: vi.fn(),
  installationStart: vi.fn(),
  repoCreateSpec: vi.fn(),
  repoLink: vi.fn(),
  // TK-48d : lecture de la spec (contrat 0.7.0) et dépôts du projet
  specHead: vi.fn(),
  specListFeatures: vi.fn(),
  specGetFeature: vi.fn(),
  repoList: vi.fn(),
};

const query = (name: string[], queryFn: ReturnType<typeof vi.fn>) => ({
  queryOptions: () => ({ queryKey: name, queryFn }),
  key: () => name,
});

/**
 * Requête oRPC dont l'entrée compte (TK-35) : `queryOptions({ input })`, `infiniteOptions({ input: (cursor) => ... })`
 * et `call(input)` appellent tous la procédure simulée avec l'entrée, comme le client réel.
 */
const queryWithInput = (name: string[], fn: Mock<(input?: unknown) => unknown>) => ({
  queryOptions: (options?: { input?: unknown }) => ({
    queryKey: [...name, options?.input ?? null],
    queryFn: () => fn(options?.input),
  }),
  infiniteOptions: (options: {
    input: (pageParam: unknown) => unknown;
    initialPageParam?: unknown;
    getNextPageParam: (lastPage: unknown) => unknown;
  }) => ({
    queryKey: [...name, "infinite", options.input(options.initialPageParam)],
    queryFn: (context: { pageParam: unknown }) => fn(options.input(context.pageParam)),
    initialPageParam: options.initialPageParam,
    getNextPageParam: options.getNextPageParam,
  }),
  call: (input?: unknown) => fn(input),
  key: () => name,
});
/** Requête dont les options (`enabled`…) sont transmises telles quelles, comme le client oRPC réel. */
const queryWithOptions = (name: string[], queryFn: ReturnType<typeof vi.fn>) => ({
  queryOptions: (options?: Record<string, unknown>) => ({ queryKey: name, queryFn, ...options }),
  key: () => name,
});
/**
 * Procédure de lecture dont TOUTES les options TanStack (`enabled`, `refetchInterval`, `select`, ...) sont
 * transmises telles quelles, comme le client oRPC réel (`queryOptions({ input, ...options })`).
 */
const queryFull = (name: string[], fn: Mock<(input?: unknown) => unknown>) => ({
  queryOptions: ({ input, ...rest }: { input?: unknown } & Record<string, unknown> = {}) => ({
    queryKey: [...name, input ?? null],
    queryFn: () => fn(input),
    ...rest,
  }),
  infiniteOptions: ({
    input,
    ...rest
  }: {
    input: (pageParam: unknown) => unknown;
    initialPageParam?: unknown;
    getNextPageParam: (lastPage: unknown) => unknown;
  } & Record<string, unknown>) => ({
    queryKey: [...name, "infinite", input(rest.initialPageParam)],
    queryFn: (context: { pageParam: unknown }) => fn(input(context.pageParam)),
    ...rest,
  }),
  key: () => name,
});
const mutation = (mutationFn: ReturnType<typeof vi.fn>) => ({
  mutationOptions: () => ({ mutationFn }),
});

export const orpc = {
  organization: {
    list: query(["organization", "list"], procedures.organizationList),
    create: mutation(procedures.organizationCreate),
  },
  member: {
    list: query(["member", "list"], procedures.memberList),
    invite: mutation(procedures.memberInvite),
  },
  project: {
    list: query(["project", "list"], procedures.projectList),
    create: mutation(procedures.projectCreate),
  },
  sprint: {
    key: () => ["sprint"],
    list: queryWithInput(["sprint", "list"], procedures.sprintList),
  },
  installation: {
    key: () => ["installation"],
    list: queryWithOptions(["installation", "list"], procedures.installationList),
    start: mutation(procedures.installationStart),
  },
  repo: {
    key: () => ["repo"],
    createSpec: mutation(procedures.repoCreateSpec),
    link: mutation(procedures.repoLink),
    list: queryFull(["repo", "list"], procedures.repoList),
  },
  spec: {
    key: () => ["spec"],
    head: queryFull(["spec", "head"], procedures.specHead),
    listFeatures: queryFull(["spec", "listFeatures"], procedures.specListFeatures),
    getFeature: queryFull(["spec", "getFeature"], procedures.specGetFeature),
  },
  ticket: {
    key: () => ["ticket"],
    list: queryWithInput(["ticket", "list"], procedures.ticketList),
    transition: mutation(procedures.ticketTransition),
  },
};

export const ORG_ID = "01900000-0000-7000-8000-0000000000a1";
export const OTHER_ORG_ID = "01900000-0000-7000-8000-0000000000a2";

export const organization = (over: Record<string, unknown> = {}) => ({
  id: ORG_ID,
  name: "Atelier Lumière",
  slug: "atelier-lumiere",
  role: "owner",
  ...over,
});

/** Erreur typée comme celles que lève le client oRPC (`code`, `data`). */
export const apiError = (code: string, data?: unknown) =>
  Object.assign(new Error(code), { code, ...(data === undefined ? {} : { data }) });

export const sessionWith = (activeOrganizationId: string | null) => ({
  data: {
    user: { id: "u1", name: "Awa Koné", email: "awa@example.com", image: null },
    session: { id: "s1", activeOrganizationId },
  },
  error: null,
});
export const NO_SESSION = { data: null, error: null };

export function resetWebMocks(): void {
  for (const fn of [
    router.replace,
    router.push,
    router.refresh,
    getSession,
    setActive,
    signOut,
    getInvitation,
    acceptInvitation,
    listOrganizations,
    ...Object.values(procedures),
  ]) {
    fn.mockReset();
  }
  pathname.current = "/projects";
  setActive.mockResolvedValue({ data: {}, error: null });
  getSession.mockResolvedValue(sessionWith(ORG_ID));
  procedures.organizationList.mockResolvedValue([organization()]);
  procedures.projectList.mockResolvedValue([]);
  procedures.memberList.mockResolvedValue([]);
}

/** Chemins vers lesquels le composant a navigué (push ou replace). */
export const navigations = (): string[] =>
  [...router.replace.mock.calls, ...router.push.mock.calls].map((call) => String(call[0]));

/** Radix (menus, panneaux, listes) utilise des API que jsdom n'implémente pas. */
export function polyfillRadix(): void {
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// --- Adresse du navigateur (TK-48d) -----------------------------------------------------------------
// Le Green lit les paramètres par `useSearchParams()` de next/navigation et les écrit par
// `window.history.pushState` (fiche) / `replaceState` (filtres), comme le routeur de Next 16 les relit.

const URL_EVENT = "koklo:test-url";
type HistoryMethod = "pushState" | "replaceState";
const originals: Partial<Record<HistoryMethod, History[HistoryMethod]>> = {};

/** À appeler dans `beforeEach` : la navigation par l'API History notifie les composants abonnés. */
export function watchUrl(): void {
  for (const method of ["pushState", "replaceState"] as const) {
    originals[method] ??= window.history[method].bind(window.history);
    window.history[method] = ((data: unknown, unused: string, url?: string | URL | null) => {
      originals[method]?.(data, unused, url);
      window.dispatchEvent(new Event(URL_EVENT));
    }) as History[HistoryMethod];
  }
}

/** Place le navigateur sur une adresse sans notifier (avant le rendu). */
export function setUrl(path: string): void {
  (originals.replaceState ?? window.history.replaceState.bind(window.history))(null, "", path);
}

function subscribeToUrl(onChange: () => void): () => void {
  window.addEventListener(URL_EVENT, onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener(URL_EVENT, onChange);
    window.removeEventListener("popstate", onChange);
  };
}

/** `useSearchParams` de next/navigation, relié à `window.location`. */
export function useSearchParams(): URLSearchParams {
  const search = useSyncExternalStore(
    subscribeToUrl,
    () => window.location.search,
    () => "",
  );
  return new URLSearchParams(search);
}
