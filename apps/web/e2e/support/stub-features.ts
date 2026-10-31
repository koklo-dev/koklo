import type { IncomingMessage } from "node:http";
import {
  createdFeatures,
  currentSha,
  handleFeatureWrites,
  renamed,
  resetFeatureWrites,
  type WriteMode,
} from "./stub-feature-write.ts";

/**
 * Faux API de l'écran /projects/[projectId]/features (TK-48 / 48d) : `spec.head`, `spec.listFeatures`,
 * `spec.getFeature` et `repo.list`, sans Postgres ni GitHub. Piloté par le scénario :
 * - `spec` (état de la spec du projet) ;
 * - `feature` (réponse de `spec.getFeature`).
 * Tout projet inconnu (ni de la liste, ni créé pendant le scénario) répond NOT_FOUND, comme l'API réelle.
 * Les appels reçus sont consultables par `/__spec-reads` (corps = chemin + query), dans l'ordre.
 */
export type SpecMode =
  | "ready"
  | "loading"
  | "empty"
  | "building"
  | "noSpec"
  | "noSpecRepo"
  | "failed"
  | "listError"
  | "paginated";
export type FeatureMode =
  | "ok"
  | "unavailable"
  | "authExpired"
  | "rateLimited"
  | "notFound"
  | "indexFailed"
  | "internal"
  | "loading";
export type FeaturesScenario = { spec?: SpecMode; feature?: FeatureMode; write?: WriteMode };

type Reply = { status: number; body: string };
type Send = (reply: Reply) => void;
const reply = (status: number, body: unknown): Reply => ({ status, body: JSON.stringify(body) });
const typed = (status: number, code: string, data?: unknown): Reply =>
  reply(status, { defined: true, code, message: code, ...(data === undefined ? {} : { data }) });

const SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
const INDEXED_AT = "2026-10-30T12:00:00.000Z";
export const FEATURE_PROJECT_ID = "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b01";
export const UNKNOWN_PROJECT_ID = "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b77";

const featureId = (n: number) => `F-${String(n).padStart(3, "0")}`;
const summary = (n: number, over: Record<string, unknown> = {}) => ({
  specId: featureId(n),
  title: `Fonctionnalité numéro ${n}`,
  status: "specifiee",
  priority: "must",
  filePath: `.koklo/features/${featureId(n)}.yaml`,
  criteriaCount: 2,
  ...over,
});

const FEW = [
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
const MANY = Array.from({ length: 60 }, (_, i) => summary(i + 1));
const PAGE = 50;

const DETAIL = {
  specId: "F-001",
  title: "Connexion par e-mail",
  status: "brouillon",
  priority: "must",
  description:
    "La personne se connecte avec son adresse e-mail.\n\nUn lien de connexion lui est envoyé.",
  criteria: [
    {
      specId: "AC-1",
      position: 1,
      title: "Connexion réussie",
      steps: [
        { type: "etant_donne", text: "un compte existant" },
        { type: "quand", text: "la personne saisit son adresse" },
        { type: "alors", text: "elle accède à ses projets" },
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

const SPEC_REPO = {
  id: "01900000-0000-7000-8000-0000000000f1",
  projectId: FEATURE_PROJECT_ID,
  installationId: "01900000-0000-7000-8000-000000000101",
  role: "spec",
  mode: "new",
  ownerLogin: "acme-corp",
  name: "atelier-spec",
  defaultBranch: "main",
  specPath: ".koklo",
};

const reads: string[] = [];
/** Le dépôt de spec a été créé pendant le scénario (reprise depuis la page) : la spec passe en préparation. */
let specRepoCreated = false;

export function resetFeatures(): void {
  resetFeatureWrites();
  reads.length = 0;
  specRepoCreated = false;
}
export const markSpecRepoCreated = (): void => {
  specRepoCreated = true;
};

const effectiveMode = (scenario: FeaturesScenario): SpecMode => {
  const mode = scenario.spec ?? "ready";
  return specRepoCreated && (mode === "noSpec" || mode === "noSpecRepo") ? "building" : mode;
};

const head = (mode: SpecMode) => {
  switch (mode) {
    case "noSpec":
    case "noSpecRepo":
      return null;
    case "building":
      return {
        ...baseHead(),
        status: "building",
        counts: { features: 0, tables: 0, endpoints: 0 },
      };
    case "failed":
      return { ...baseHead(), status: "failed", errorCode: "spec_too_large" };
    case "empty":
      return { ...baseHead(), counts: { features: 0, tables: 0, endpoints: 0 } };
    case "paginated":
      return { ...baseHead(), counts: { features: MANY.length, tables: 2, endpoints: 4 } };
    default:
      return baseHead();
  }
};
let writeMode: WriteMode | undefined;
const baseHead = () => ({
  branch: "main",
  commitSha: currentSha(writeMode === "indexLate"),
  status: "ready",
  errorCode: null as string | null,
  indexedAt: INDEXED_AT,
  counts: { features: FEW.length + createdFeatures().length, tables: 2, endpoints: 4 },
});

function listFeatures(mode: SpecMode, query: URLSearchParams): Reply {
  if (mode === "listError") return reply(500, { defined: false, code: "INTERNAL", message: "x" });
  if (mode === "failed") {
    return typed(409, "SPEC_INDEX_FAILED", { errorCode: "spec_too_large", commitSha: SHA });
  }
  const base = mode === "paginated" ? MANY : mode === "empty" || mode === "building" ? [] : FEW;
  const source = [
    ...base.map((item) => ({ ...item, title: renamed(item.specId) ?? item.title })),
    ...(mode === "ready" || mode === "paginated"
      ? createdFeatures().map((c) =>
          summary(Number(c.specId.slice(2)), {
            title: c.title,
            status: c.status,
            priority: c.priority,
            criteriaCount: c.criteriaCount,
          }),
        )
      : []),
  ];
  const status = query.get("status");
  const priority = query.get("priority");
  const filtered = source.filter(
    (item) => (!status || item.status === status) && (!priority || item.priority === priority),
  );
  const start = Number(query.get("cursor") ?? 0) || 0;
  const items = filtered.slice(start, start + PAGE);
  const next = start + PAGE < filtered.length ? String(start + PAGE) : null;
  return reply(200, { items, nextCursor: next });
}

function getFeature(mode: FeatureMode, specId: string): Reply {
  switch (mode) {
    case "unavailable":
      return typed(503, "PROVIDER_UNAVAILABLE");
    case "authExpired":
      return typed(403, "PROVIDER_AUTH_EXPIRED", { kind: "installation", refreshable: false });
    case "rateLimited":
      return typed(429, "PROVIDER_RATE_LIMITED", { retryAfterMs: 3000 });
    case "notFound":
      return typed(404, "NOT_FOUND");
    case "indexFailed":
      return typed(409, "SPEC_INDEX_FAILED", { errorCode: "spec_too_large", commitSha: SHA });
    case "internal":
      return reply(500, { defined: false, code: "INTERNAL", message: "x" });
    default: {
      const found = [...FEW, ...MANY].find((item) => item.specId === specId);
      const title = renamed(specId) ?? found?.title ?? DETAIL.title;
      return reply(200, {
        ...DETAIL,
        specId,
        title,
        commitSha: currentSha(writeMode === "indexLate"),
      });
    }
  }
}

interface Handlers {
  scenario: FeaturesScenario;
  /** Projets connus : un autre identifiant répond NOT_FOUND. */
  knownProject: (id: string) => boolean;
  send: Send;
  hold: (release: () => void) => void;
}

const ROUTE = /^\/projects\/([^/]+)\/(spec|repos)(?:\/features(?:\/(F-\d+))?)?$/;

export function handleFeatures(req: IncomingMessage, url: URL, h: Handlers): boolean {
  if (handleFeatureWrites(req, url, { mode: h.scenario.write ?? "ok", ...h })) return true;
  if (url.pathname === "/__spec-reads") {
    h.send(reply(200, reads));
    return true;
  }
  if (req.method !== "GET") return false;
  const match = ROUTE.exec(url.pathname);
  if (!match) return false;
  const [, projectId = "", resource, specId] = match;
  const isFeatures = url.pathname.includes("/features");
  if (resource === "repos" && url.pathname.endsWith("/repos")) return repoList(projectId, h);
  reads.push(`${url.pathname}${url.search}`);
  if (!h.knownProject(projectId)) {
    h.send(typed(404, "NOT_FOUND"));
    return true;
  }
  writeMode = h.scenario.write;
  answerRead(h, effectiveMode(h.scenario), url, specId, isFeatures);
  return true;
}

function answerRead(
  h: Handlers,
  mode: SpecMode,
  url: URL,
  specId: string | undefined,
  isFeatures: boolean,
): void {
  if (specId) {
    const featureMode = h.scenario.feature ?? "ok";
    if (featureMode === "loading") h.hold(() => h.send(getFeature("ok", specId)));
    else h.send(getFeature(featureMode, specId));
    return;
  }
  if (isFeatures) {
    h.send(listFeatures(mode, url.searchParams));
    return;
  }
  const answer = reply(200, head(mode));
  if (mode === "loading") h.hold(() => h.send(answer));
  else h.send(answer);
}

function repoList(projectId: string, h: Handlers): boolean {
  reads.push(`/projects/${projectId}/repos`);
  if (!h.knownProject(projectId)) {
    h.send(typed(404, "NOT_FOUND"));
    return true;
  }
  const mode = effectiveMode(h.scenario);
  const hasRepo = mode === "noSpecRepo" || mode === "building" || specRepoCreated;
  h.send(reply(200, hasRepo ? [SPEC_REPO] : []));
  return true;
}
