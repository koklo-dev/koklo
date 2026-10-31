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
export type SpecRepoScenario = {
  specRepo?: SpecRepoMode;
  /** `loading` retient la réponse de `project.create` jusqu'à `/__release`. */
  projectCreate?: "ok" | "loading";
  /** Réponse de `repo.link` (défaut : ok). */
  repoLink?: "ok" | "notFound";
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
const specRepoCalls: unknown[] = [];
const repoLinks: unknown[] = [];
let specAttempts = 0;

export function resetSpecRepo(): void {
  projectCreates.length = 0;
  specRepoCalls.length = 0;
  repoLinks.length = 0;
  specAttempts = 0;
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

interface Handlers {
  scenario: SpecRepoScenario;
  /** Ajoute le projet créé à la liste servie par `project.list` (jusqu'au prochain scénario). */
  addProject: (project: { id: string; name: string }) => void;
  send: Send;
  hold: (release: () => void) => void;
}

export function handleSpecRepo(req: IncomingMessage, path: string, h: Handlers): boolean {
  const { scenario, send, hold, addProject } = h;
  const journals: Record<string, unknown[]> = {
    "/__project-creates": projectCreates,
    "/__spec-repo-calls": specRepoCalls,
    "/__repo-links": repoLinks,
  };
  const journal = journals[path];
  if (journal) {
    send(reply(200, journal));
    return true;
  }
  if (req.method !== "POST") return false;
  if (path.endsWith("/projects")) {
    readBody(req, (body) => {
      projectCreates.push(body);
      addProject({ id: CREATED_PROJECT_ID, name: String(body.name) });
      const created = reply(200, { id: CREATED_PROJECT_ID, name: body.name });
      if (scenario.projectCreate === "loading") hold(() => send(created));
      else send(created);
    });
    return true;
  }
  if (path.endsWith("/spec-repo")) {
    readBody(req, (body) => {
      specRepoCalls.push(body);
      const answer = () => send(specRepoResponse(scenario.specRepo ?? "ok"));
      if (scenario.specRepo === "loading") hold(answer);
      else answer();
    });
    return true;
  }
  if (path.endsWith("/repos")) {
    readBody(req, (body) => {
      repoLinks.push(body);
      send(scenario.repoLink === "notFound" ? typed(404, "NOT_FOUND") : reply(200, REPO));
    });
    return true;
  }
  return false;
}
