import { DELIVERABLE_KEYS } from "@koklo/contract";
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
  // TK-97 (contrat 2.2.0) : Membres (tableau paginé, rôle, retrait) et invitations
  memberPage: vi.fn(),
  memberUpdateRole: vi.fn(),
  memberRemove: vi.fn(),
  invitationList: vi.fn(),
  invitationCreate: vi.fn(),
  invitationResend: vi.fn(),
  invitationRevoke: vi.fn(),
  projectList: vi.fn(),
  projectCards: vi.fn(),
  projectCreate: vi.fn(),
  projectCreationStatus: vi.fn(),
  projectRetryRepo: vi.fn(),
  // TK-88 : coquille (contrat 2.1.0) — agrégat du projet, visites, récents, recherche ⌘K
  projectShell: vi.fn(),
  projectVisit: vi.fn(),
  projectRecent: vi.fn(),
  // TK-92 (contrat 2.7.0) : vue d'ensemble et activité du projet
  projectOverview: vi.fn(),
  projectActivity: vi.fn(),
  searchQuery: vi.fn(),
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
  // TK-101 (contrat 2.11.0) : lecture d'édition, autocomplétion des liens et préremplissage
  specItemGet: vi.fn(),
  // TK-107 (contrat 3.5.0) : onglets Tables et Jeux d'exemple, diagramme minimal
  specDataTablesList: vi.fn(),
  specDataMermaid: vi.fn(),
  // TK-108 (contrat 3.6.0) : positions du diagramme et source d'une table
  specDataLayoutGet: vi.fn(),
  specDataLayoutSave: vi.fn(),
  specDataTablesSource: vi.fn(),
  specDataFixturesList: vi.fn(),
  specDataFixturesRows: vi.fn(),
  specRefsSearch: vi.fn(),
  // TK-103 (contrat 3.1.0) : règles métier, parcours (liste paginée) et matrice des rôles
  specFunctionalList: vi.fn(),
  specRolesMatrix: vi.fn(),
  aiPrefillItem: vi.fn(),
  // TK-100 (contrat 2.10.0) : les sept livrables de la spec (barre et compteur SPEC N/7)
  specDeliverables: vi.fn(),
  repoList: vi.fn(),
  // TK-104 (contrat 3.2.0) : vue client (progression, listes en langage simple) et décisions du client
  clientSpaceProgress: vi.fn(),
  clientSpaceFeatures: vi.fn(),
  clientSpaceFeature: vi.fn(),
  clientSpaceFlows: vi.fn(),
  clientSpaceRules: vi.fn(),
  clientSpaceRoles: vi.fn(),
  // TK-109 (contrat 3.7.0) : modèle de données validé, vu du client
  clientSpaceDataModel: vi.fn(),
  clientSpaceDataFixtures: vi.fn(),
  clientSpaceDataFixtureRows: vi.fn(),
  reviewSubmit: vi.fn(),
  reviewList: vi.fn(),
  // TK-109 (contrat 3.7.0) : commentaires de table
  commentCreate: vi.fn(),
  commentList: vi.fn(),
  reviewRemind: vi.fn(),
  // TK-48e : écriture de la spec par lots (contrat 0.7.0)
  specBatchSubmit: vi.fn(),
  specBatchGet: vi.fn(),
  // TK-59 : propositions de l'IA (contrat 0.9.0), jamais d'appel réel
  aiProposeFeatures: vi.fn(),
  // TK-99b (contrat 2.9.0) : propositions de l'agent sur le Fonctionnel, jamais d'appel réel
  aiProposeOptions: vi.fn(),
  aiProposeDeliverable: vi.fn(),
  aiReviseProposal: vi.fn(),
  proposalList: vi.fn(),
  proposalDecide: vi.fn(),
  proposalDecideMany: vi.fn(),
  // Fournisseurs d'IA (contrat 2.3.0, TK-98) : jamais d'appel réel
  aiProviderList: vi.fn(),
  aiProviderAdd: vi.fn(),
  aiProviderVerify: vi.fn(),
  aiProviderReplaceKey: vi.fn(),
  aiProviderRemove: vi.fn(),
  aiProviderSetPrimary: vi.fn(),
  aiModelListQualified: vi.fn(),
  aiUsageSet: vi.fn(),
  aiUsageReport: vi.fn(),
  aiSettingsGet: vi.fn(),
  aiSettingsUpdate: vi.fn(),
  // TK-97 (contrat 2.2.0) : Général (org.get / org.update) et Mon compte (me.*)
  orgGet: vi.fn(),
  orgUpdate: vi.fn(),
  meGet: vi.fn(),
  meUpdate: vi.fn(),
  meGetNotifications: vi.fn(),
  meUpdateNotification: vi.fn(),
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

const mutationWithOptions = (mutationFn: ReturnType<typeof vi.fn>) => ({
  mutationOptions: (options: Record<string, unknown> = {}) => ({ mutationFn, ...options }),
});

export const orpc = {
  organization: {
    list: query(["organization", "list"], procedures.organizationList),
    create: mutation(procedures.organizationCreate),
  },
  member: {
    key: () => ["member"],
    page: queryFull(["member", "page"], procedures.memberPage),
    updateRole: mutationWithOptions(procedures.memberUpdateRole),
    remove: mutationWithOptions(procedures.memberRemove),
  },
  invitation: {
    key: () => ["invitation"],
    list: queryFull(["invitation", "list"], procedures.invitationList),
    create: mutationWithOptions(procedures.invitationCreate),
    resend: mutationWithOptions(procedures.invitationResend),
    revoke: mutationWithOptions(procedures.invitationRevoke),
  },
  project: {
    list: query(["project", "list"], procedures.projectList),
    cards: queryFull(["project", "cards"], procedures.projectCards),
    create: mutation(procedures.projectCreate),
    creationStatus: queryFull(["project", "creationStatus"], procedures.projectCreationStatus),
    retryRepo: mutationWithOptions(procedures.projectRetryRepo),
    key: () => ["project"],
    shell: queryFull(["project", "shell"], procedures.projectShell),
    visit: mutationWithOptions(procedures.projectVisit),
    recent: queryFull(["project", "recent"], procedures.projectRecent),
    overview: queryFull(["project", "overview"], procedures.projectOverview),
    activity: queryFull(["project", "activity"], procedures.projectActivity),
  },
  search: {
    key: () => ["search"],
    query: queryFull(["search", "query"], procedures.searchQuery),
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
    item: {
      key: () => ["spec", "item"],
      get: {
        ...queryFull(["spec", "item", "get"], procedures.specItemGet),
        call: (input?: unknown) => procedures.specItemGet(input),
      },
    },
    data: {
      key: () => ["spec", "data"],
      tables: {
        list: queryFull(["spec", "data", "tables", "list"], procedures.specDataTablesList),
        source: queryFull(["spec", "data", "tables", "source"], procedures.specDataTablesSource),
      },
      mermaid: queryFull(["spec", "data", "mermaid"], procedures.specDataMermaid),
      layout: {
        get: queryFull(["spec", "data", "layout", "get"], procedures.specDataLayoutGet),
        save: {
          ...mutation(procedures.specDataLayoutSave),
          call: (input?: unknown) => procedures.specDataLayoutSave(input),
        },
      },
      fixtures: {
        list: queryFull(["spec", "data", "fixtures", "list"], procedures.specDataFixturesList),
        rows: queryFull(["spec", "data", "fixtures", "rows"], procedures.specDataFixturesRows),
      },
    },
    functional: {
      key: () => ["spec", "functional"],
      list: queryFull(["spec", "functional", "list"], procedures.specFunctionalList),
    },
    roles: {
      key: () => ["spec", "roles"],
      matrix: queryFull(["spec", "roles", "matrix"], procedures.specRolesMatrix),
    },
    refs: { search: queryFull(["spec", "refs", "search"], procedures.specRefsSearch) },
    deliverables: queryFull(["spec", "deliverables"], procedures.specDeliverables),
  },
  clientSpace: {
    key: () => ["clientSpace"],
    progress: queryFull(["clientSpace", "progress"], procedures.clientSpaceProgress),
    features: queryFull(["clientSpace", "features"], procedures.clientSpaceFeatures),
    feature: queryFull(["clientSpace", "feature"], procedures.clientSpaceFeature),
    flows: queryFull(["clientSpace", "flows"], procedures.clientSpaceFlows),
    rules: queryFull(["clientSpace", "rules"], procedures.clientSpaceRules),
    roles: queryFull(["clientSpace", "roles"], procedures.clientSpaceRoles),
    dataModel: queryFull(["clientSpace", "dataModel"], procedures.clientSpaceDataModel),
    dataFixtures: queryFull(["clientSpace", "dataFixtures"], procedures.clientSpaceDataFixtures),
    dataFixtureRows: queryFull(
      ["clientSpace", "dataFixtureRows"],
      procedures.clientSpaceDataFixtureRows,
    ),
  },
  comment: {
    key: () => ["comment"],
    create: mutationWithOptions(procedures.commentCreate),
    list: queryFull(["comment", "list"], procedures.commentList),
  },
  review: {
    key: () => ["review"],
    submit: mutationWithOptions(procedures.reviewSubmit),
    list: queryFull(["review", "list"], procedures.reviewList),
    remind: mutationWithOptions(procedures.reviewRemind),
  },
  specBatch: {
    key: () => ["specBatch"],
    // `submit` : useMutation(mutationOptions()) ; `get` : useQuery(queryOptions({ input, ...options })) ou `call`.
    submit: {
      mutationOptions: (options: Record<string, unknown> = {}) => ({
        mutationFn: procedures.specBatchSubmit,
        ...options,
      }),
    },
    get: {
      ...queryFull(["specBatch", "get"], procedures.specBatchGet),
      call: (input?: unknown) => procedures.specBatchGet(input),
    },
  },
  ai: {
    key: () => ["ai"],
    proposeFeatures: mutation(procedures.aiProposeFeatures),
    prefillItem: mutationWithOptions(procedures.aiPrefillItem),
    proposeOptions: queryFull(["ai", "proposeOptions"], procedures.aiProposeOptions),
    proposeDeliverable: mutationWithOptions(procedures.aiProposeDeliverable),
    reviseProposal: mutationWithOptions(procedures.aiReviseProposal),
  },
  proposal: {
    key: () => ["proposal"],
    list: {
      ...queryFull(["proposal", "list"], procedures.proposalList),
      call: (input?: unknown) => procedures.proposalList(input),
    },
    decide: mutationWithOptions(procedures.proposalDecide),
    decideMany: mutationWithOptions(procedures.proposalDecideMany),
  },
  // Les options (`gcTime`, `retry`...) sont transmises telles quelles, comme le client oRPC réel.
  aiProvider: {
    key: () => ["aiProvider"],
    list: queryFull(["aiProvider", "list"], procedures.aiProviderList),
    add: mutationWithOptions(procedures.aiProviderAdd),
    verify: mutationWithOptions(procedures.aiProviderVerify),
    replaceKey: mutationWithOptions(procedures.aiProviderReplaceKey),
    remove: mutationWithOptions(procedures.aiProviderRemove),
    setPrimary: mutationWithOptions(procedures.aiProviderSetPrimary),
  },
  aiModel: {
    key: () => ["aiModel"],
    listQualified: queryFull(["aiModel", "listQualified"], procedures.aiModelListQualified),
  },
  aiUsage: {
    key: () => ["aiUsage"],
    set: mutationWithOptions(procedures.aiUsageSet),
    report: queryFull(["aiUsage", "report"], procedures.aiUsageReport),
  },
  aiSettings: {
    key: () => ["aiSettings"],
    get: queryFull(["aiSettings", "get"], procedures.aiSettingsGet),
    update: mutationWithOptions(procedures.aiSettingsUpdate),
  },
  org: {
    key: () => ["org"],
    get: queryFull(["org", "get"], procedures.orgGet),
    update: mutationWithOptions(procedures.orgUpdate),
  },
  me: {
    key: () => ["me"],
    get: queryFull(["me", "get"], procedures.meGet),
    update: mutationWithOptions(procedures.meUpdate),
    getNotifications: queryFull(["me", "getNotifications"], procedures.meGetNotifications),
    updateNotification: mutationWithOptions(procedures.meUpdateNotification),
  },
  ticket: {
    key: () => ["ticket"],
    list: queryFull(["ticket", "list"], procedures.ticketList),
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

export const PROJECT_ID = "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b01";

const AVAILABLE = new Set<string>(["functional", "data", "design"]);

/** Une carte de `project.cards` (contrat 2.8.0) : projet d'idée sans client, sans création. */
export const projectCard = (over: Record<string, unknown> = {}) => ({
  id: "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b01",
  name: "Alpha",
  initials: "AL",
  colorKey: 1,
  clientContact: null,
  phase: "idea",
  progress: {
    label: "Dossier d'idée",
    done: 1,
    total: 10,
    valueLabel: "1 page stable sur 10",
  },
  nextAction: null as { title: string; attention: boolean } | null,
  people: [{ initials: "AK", name: "Awa Koné", client: false }],
  lastActivity: null,
  creation: null,
  ...over,
});

/** Une page de `project.cards` : facettes calculées sur les cartes données, sauf surcharge. */
export const cardsPage = (
  items: Array<ReturnType<typeof projectCard>>,
  over: Record<string, unknown> = {},
) => ({
  items,
  nextCursor: null,
  total: items.length,
  facets: {
    all: items.length,
    idea: items.filter((card) => card.phase === "idea").length,
    framing: items.filter((card) => card.phase === "framing").length,
    iterations: items.filter((card) => card.phase === "iterations").length,
  },
  attention: items.filter((card) => card.nextAction?.attention).length,
  audience: "team",
  ...over,
});

/** Sortie de `project.shell` : Fonctionnel, Données et Design disponibles, les autres verrouillés (B77). */
export const projectShell = (over: Record<string, unknown> = {}) => ({
  id: PROJECT_ID,
  name: "Portail de réservation",
  phase: "framing",
  deliverables: DELIVERABLE_KEYS.map((key) => ({
    key,
    available: AVAILABLE.has(key),
    after: AVAILABLE.has(key) ? null : "l'architecture",
  })),
  validatedCount: 0,
  ticketCount: 12,
  ...over,
});

/** Sortie de `spec.deliverables` (contrat 2.10.0) : Fonctionnel, Données et Design ouverts, les autres verrouillés (B1). */
export const specDeliverables = (
  over: {
    validated?: readonly string[];
    open?: ReadonlySet<string>;
    /** Statut forcé par livrable (ex. `{ data: "pending" }`). */
    status?: Readonly<Record<string, string>>;
    /** Amont modifié depuis la dernière décision, par livrable (3.7.0). */
    staleUpstream?: Readonly<Record<string, readonly string[]>>;
  } = {},
) => {
  const open = over.open ?? AVAILABLE;
  const deliverables = DELIVERABLE_KEYS.map((key) => ({
    key,
    status: over.status?.[key] ?? (over.validated?.includes(key) ? "validated" : "todo"),
    ...(over.staleUpstream?.[key] ? { staleUpstream: over.staleUpstream[key] } : {}),
    available: open.has(key),
    forced: false,
    condition: open.has(key) ? null : "Disponible après l'architecture",
    pendingProposals: 0,
  }));
  return {
    deliverables,
    validatedCount: deliverables.filter((entry) => entry.status === "validated").length,
  };
};

/** Sortie de `org.get` (contrat 2.2.0). */
export const orgSummary = (over: Record<string, unknown> = {}) => ({
  id: ORG_ID,
  name: "Atelier Lumière",
  slug: "atelier-lumiere",
  logo: null,
  projectCount: 3,
  memberCount: 5,
  aiProviderCount: 1,
  ...over,
});

/** Sortie de `me.get`. */
export const meSummary = (over: Record<string, unknown> = {}) => ({
  id: "01900000-0000-7000-8000-0000000000c1",
  name: "Awa Koné",
  email: "awa@example.com",
  role: "owner",
  ...over,
});

const TEAM_KEYS = [
  "client_validation",
  "pr_to_review",
  "agent_silent",
  "ai_budget",
  "weekly_digest",
];
const CLIENT_KEYS = ["deliverable_to_validate", "feature_ready", "comment_reply"];

/** Sortie de `me.getNotifications` : toutes les clés du contrat, tout activé sauf le résumé de la semaine. */
export const notificationsFor = (role: string) =>
  [...TEAM_KEYS, ...CLIENT_KEYS]
    .map((key) => ({ key, enabled: key !== "weekly_digest" }))
    .filter(({ key }) => (role === "client" ? CLIENT_KEYS : TEAM_KEYS).includes(key));

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
  procedures.projectCards.mockResolvedValue(cardsPage([]));
  procedures.proposalList.mockResolvedValue({
    items: [],
    nextCursor: null,
    previousCursor: null,
    offset: 0,
    total: 0,
    groups: [],
    launch: null,
  });
  procedures.aiProposeOptions.mockResolvedValue({ options: [], reads: [], available: true });
  procedures.memberPage.mockResolvedValue({ items: [], total: 0, totalIsEstimate: false });
  procedures.invitationList.mockResolvedValue([]);
  procedures.projectShell.mockResolvedValue(projectShell());
  procedures.specDeliverables.mockResolvedValue(specDeliverables());
  // Aucun client invité par défaut : l'équipe ne voit ni « Relancer » ni la vue client.
  procedures.clientSpaceProgress.mockResolvedValue({ hasClient: false, canValidate: false });
  procedures.projectVisit.mockResolvedValue({ visitedAt: "2026-11-07T10:00:00.000Z" });
  procedures.projectRecent.mockResolvedValue([]);
  procedures.searchQuery.mockResolvedValue({ items: [], total: 0, nextCursor: null });
  procedures.orgGet.mockResolvedValue(orgSummary());
  procedures.meGet.mockResolvedValue(meSummary());
  procedures.meGetNotifications.mockResolvedValue(notificationsFor("owner"));
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
