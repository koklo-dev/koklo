import type { IncomingMessage } from "node:http";

/**
 * Faux API de la création de projet (TK-48 / 48c) : `project.create`, `repo.createSpec`, `repo.link`.
 * C'est le faux fournisseur des e2e : aucune requête ne part vers github.com ni vers une base.
 * Piloté par le scénario (`specRepo`, `projectCreate`) ; les appels reçus sont consultables par
 * `/__project-creates`, `/__spec-repo-calls` et `/__repo-links`.
 */
export type SpecRepoMode =
  | "ok"
  | "loading"
  | "unavailable"
  | "tokenRequired"
  | "nameTaken"
  | "exists"
  | "failOnceThenOk";
/**
 * État de la création du dépôt par le worker (TK-93) : `running` reste en cours, `finishing` se termine au premier
 * sondage, `succeeded` est déjà finie, un code d'échec (`CreationErrorCode`) donne une carte en échec.
 */
export type CreationMode = "running" | "finishing" | "succeeded" | string;
export type SpecRepoScenario = {
  creation?: CreationMode;
  /** Le projet créé existe dès le départ avec cet état (reprise après rechargement, captures). */
  creationSeed?: boolean;
  /** Invitation du client en échec (étape « Invitation envoyée au client »). */
  creationInvitation?: "done" | "error";
  /** État après « Réessayer » (défaut : `succeeded`). */
  retryTo?: CreationMode;
  specRepo?: SpecRepoMode;
  /** `loading` retient la réponse de `project.create` jusqu'à `/__release`. */
  projectCreate?: "ok" | "loading";
  /** Réponse de `repo.link` (défaut : ok). */
  repoLink?: "ok" | "notFound";
  /** Garde les projets créés pendant le scénario précédent (changement de scénario en cours de parcours). */
  keepProjects?: boolean;
};

type Reply = { status: number; body: string };
type Send = (reply: Reply) => void;
const reply = (status: number, body: unknown): Reply => ({ status, body: JSON.stringify(body) });
const typed = (status: number, code: string, data?: unknown): Reply =>
  reply(status, { defined: true, code, message: code, ...(data === undefined ? {} : { data }) });

export const CREATED_PROJECT_ID = "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b99";
const REPO = {
  id: "01900000-0000-7000-8000-0000000000f1",
  projectId: CREATED_PROJECT_ID,
  installationId: "01900000-0000-7000-8000-000000000101",
  role: "spec",
  mode: "new",
  ownerLogin: "acme-corp",
  name: "nouveau-projet-spec",
  defaultBranch: "main",
  specPath: ".koklo",
};

const projectCreates: unknown[] = [];
const creationRetries: unknown[] = [];
type CreationState = { mode: CreationMode; polls: number };
let creationState: CreationState | null = null;
const specRepoCalls: unknown[] = [];
const repoLinks: unknown[] = [];
let specAttempts = 0;

export function resetSpecRepo(): void {
  projectCreates.length = 0;
  specRepoCalls.length = 0;
  repoLinks.length = 0;
  creationRetries.length = 0;
  creationState = null;
  specAttempts = 0;
}

const MODES = new Set(["running", "finishing", "succeeded"]);
const PROJECT_NAME = "Atelier neuf";

/** Statut de la ligne et état de l'étape « dépôt » pour un mode du scénario. */
function creationPhase(state: CreationState): { status: string; repo: string } {
  if (state.mode === "succeeded" || (state.mode === "finishing" && state.polls > 0)) {
    return { status: "succeeded", repo: "done" };
  }
  if (MODES.has(state.mode)) return { status: "running", repo: "running" };
  return state.mode === "no_account"
    ? { status: "skipped", repo: "todo" }
    : { status: "failed", repo: "error" };
}

function creationBody(state: CreationState, scenario: SpecRepoScenario) {
  const { status, repo } = creationPhase(state);
  const invitation = scenario.creationInvitation
    ? [{ key: "invitation", status: scenario.creationInvitation }]
    : [];
  const error = {
    code: state.mode,
    ownerLogin: "acme-corp",
    repoName: "atelier-neuf-spec",
    ...(state.mode === "rate_limited" ? { retryAfterMs: 12000 } : {}),
  };
  return {
    status,
    steps: [
      { key: "project", status: "done" },
      { key: "idea", status: "done" },
      ...invitation,
      { key: "repo", status },
    ].map((step) => (step.key === "repo" ? { key: "repo", status: repo } : step)),
    ideaPages: 10,
    ...(MODES.has(state.mode) ? {} : { error }),
    canAct: true,
  };
}

/** Création à joindre à la carte du projet créé : `null` une fois le dépôt créé (carte normale). */
export function creationForCard(projectId: string, scenario: SpecRepoScenario) {
  if (projectId !== CREATED_PROJECT_ID || !creationState) return null;
  const body = creationBody(creationState, scenario);
  return body.status === "succeeded" ? null : body;
}

/** Projet créé dès le départ (`creationSeed`) : sa carte est en cours ou en échec dès le chargement de la liste. */
export function seedCreation(
  scenario: SpecRepoScenario,
  addProject: (project: { id: string; name: string }) => void,
): void {
  if (!scenario.creationSeed) return;
  addProject({ id: CREATED_PROJECT_ID, name: PROJECT_NAME });
  creationState = { mode: scenario.creation ?? "running", polls: 0 };
}

function specRepoResponse(mode: SpecRepoMode): Reply {
  specAttempts += 1;
  switch (mode) {
    case "unavailable":
      return typed(503, "PROVIDER_UNAVAILABLE");
    case "tokenRequired":
      return typed(403, "USER_TOKEN_REQUIRED", { ownerLogin: "acme-corp" });
    case "nameTaken":
      return typed(409, "CONFLICT", { reason: "repo_name_taken" });
    case "exists":
      return typed(409, "CONFLICT", { reason: "spec_repo_exists" });
    case "failOnceThenOk":
      return specAttempts === 1 ? typed(503, "PROVIDER_UNAVAILABLE") : reply(200, REPO);
    default:
      return reply(200, REPO);
  }
}

function readBody(req: IncomingMessage, done: (body: Record<string, unknown>) => void): void {
  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
  });
  req.on("end", () => done(JSON.parse(raw || "{}")));
}

/** Le projet visé est dans l'URL (`/projects/{projectId}/…`), pas dans le corps : on le journalise avec. */
const withPathProject = (path: string, body: Record<string, unknown>): Record<string, unknown> => {
  const projectId = /\/projects\/([^/]+)\//.exec(path)?.[1];
  return projectId ? { projectId, ...body } : body;
};

interface Handlers {
  scenario: SpecRepoScenario;
  /** Ajoute le projet créé à la liste servie par `project.list` (jusqu'au prochain scénario). */
  addProject: (project: { id: string; name: string }) => void;
  send: Send;
  hold: (release: () => void) => void;
  /** Le dépôt de spec vient d'être créé (réponse 200 de `repo.createSpec`). */
  onSpecRepoCreated?: () => void;
}

export function handleSpecRepo(req: IncomingMessage, path: string, h: Handlers): boolean {
  const { scenario, send, hold, addProject } = h;
  const journals: Record<string, unknown[]> = {
    "/__project-creates": projectCreates,
    "/__spec-repo-calls": specRepoCalls,
    "/__repo-links": repoLinks,
    "/__creation-retries": creationRetries,
  };
  const journal = journals[path];
  if (journal) {
    send(reply(200, journal));
    return true;
  }
  if (req.method === "GET" && path === `/projects/${CREATED_PROJECT_ID}/creation`) {
    if (creationState) creationState.polls += 1;
    send(reply(200, creationState ? creationBody(creationState, scenario) : null));
    return true;
  }
  if (req.method !== "POST") return false;
  if (path === `/projects/${CREATED_PROJECT_ID}/creation/retry`) {
    readBody(req, (body) => {
      creationRetries.push(body);
      creationState = { mode: scenario.retryTo ?? "succeeded", polls: 0 };
      send(reply(200, creationBody(creationState, scenario)));
    });
    return true;
  }
  if (path.endsWith("/projects")) {
    readBody(req, (body) => {
      projectCreates.push(body);
      creationState = { mode: scenario.creation ?? "succeeded", polls: 0 };
      addProject({ id: CREATED_PROJECT_ID, name: String(body.name) });
      const created = reply(200, { id: CREATED_PROJECT_ID, name: body.name });
      if (scenario.projectCreate === "loading") hold(() => send(created));
      else send(created);
    });
    return true;
  }
  if (path.endsWith("/spec-repo")) {
    readBody(req, (body) => {
      specRepoCalls.push(withPathProject(path, body));
      const answer = () => {
        const response = specRepoResponse(scenario.specRepo ?? "ok");
        if (response.status === 200) h.onSpecRepoCreated?.();
        send(response);
      };
      if (scenario.specRepo === "loading") hold(answer);
      else answer();
    });
    return true;
  }
  if (path.endsWith("/repos")) {
    readBody(req, (body) => {
      repoLinks.push(withPathProject(path, body));
      send(scenario.repoLink === "notFound" ? typed(404, "NOT_FOUND") : reply(200, REPO));
    });
    return true;
  }
  return false;
}
