import { createServer, type IncomingMessage } from "node:http";
import { handleProviders, type ProvidersScenario, resetProviders } from "./stub-ai-providers.ts";
import {
  type FeaturesScenario,
  handleFeatures,
  markSpecRepoCreated,
  resetFeatures,
} from "./stub-features.ts";
import { type GithubScenario, handleGithub, resetGithub } from "./stub-github.ts";
import { handleIdea, type IdeaScenario, resetIdea } from "./stub-idea-agent.ts";
import { handleKanban, type KanbanRole, type KanbanScenario, resetKanban } from "./stub-kanban.ts";
import { resetMembers } from "./stub-members.ts";
import { handleOverview, type OverviewScenario } from "./stub-overview.ts";
import { handleProjectCards, type ProjectsCardsScenario } from "./stub-projects.ts";
import { handleProposals, type ProposalsScenario, resetProposals } from "./stub-proposals.ts";
import { handleSettings, resetSettings, type SettingsScenario } from "./stub-settings.ts";
import { handleShell, resetShell, type ShellScenario } from "./stub-shell.ts";
import {
  handleSpecRepo,
  resetSpecRepo,
  type SpecRepoScenario,
  seedCreation,
} from "./stub-spec-repo.ts";

/**
 * Faux API pour les e2e : session Better Auth + project.list, sans Postgres.
 * Piloté par POST /__scenario { session: boolean, projects: "loading"|"empty"|"data"|"internal"|"unauthorized" }.
 * "loading" retient la réponse jusqu'à POST /__release (capture de l'état de chargement).
 */
type Scenario = {
  session: boolean;
  projects: "loading" | "empty" | "data" | "internal" | "unauthorized";
  /** Organisations de la personne (défaut : une seule, propriétaire). */
  organizations?: "none" | "one" | "many";
  /** Organisation active sur la session (défaut : oui). */
  activeOrganization?: boolean;
  /** Aperçu d'invitation (`/accept-invitation/<id>`) ; absent = invitation inconnue. */
  invitation?: "ready" | "member" | "wrong" | "invalid";
  /** Rôle de la personne dans l'organisation active (défaut : owner). */
  role?: KanbanRole;
} & KanbanScenario &
  GithubScenario &
  SpecRepoScenario &
  FeaturesScenario &
  ProposalsScenario &
  ProvidersScenario &
  ShellScenario &
  OverviewScenario &
  IdeaScenario &
  ProjectsCardsScenario &
  SettingsScenario;

let scenario: Scenario = { session: true, projects: "data" };
const held: Array<() => void> = [];

const PROJECTS = [
  { id: "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b01", name: "Atelier Lumière" },
  { id: "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b02", name: "Plateforme de réservation" },
  { id: "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b03", name: "Portail partenaires" },
];

/** Projets créés pendant le scénario (`project.create` du faux API), servis par `project.list`. */
const createdProjects: Array<{ id: string; name: string }> = [];
const addProject = (project: { id: string; name: string }) => void createdProjects.push(project);

const ORG_ID = "01900000-0000-7000-8000-0000000000a1";
const ORGANIZATIONS = [
  { id: ORG_ID, name: "Atelier Lumière", slug: "atelier-lumiere", role: "owner" },
  {
    id: "01900000-0000-7000-8000-0000000000a2",
    name: "Studio Nord",
    slug: "studio-nord",
    role: "dev",
  },
];

const session = () => ({
  session: {
    id: "s1",
    userId: "u1",
    expiresAt: "2999-01-01T00:00:00.000Z",
    token: "t",
    activeOrganizationId: scenario.activeOrganization === false ? null : ORG_ID,
  },
  user: { id: "u1", name: "Test", email: "test@example.com", emailVerified: true },
});

function organizations(): typeof ORGANIZATIONS {
  const mode = scenario.organizations ?? "one";
  if (mode === "none") return [];
  const all = mode === "many" ? ORGANIZATIONS : ORGANIZATIONS.slice(0, 1);
  return all.map((org, index) =>
    index === 0 && scenario.role ? { ...org, role: scenario.role } : org,
  );
}

const json = (status: number, body: unknown) => ({ status, body: JSON.stringify(body) });

function projectsResponse(): ReturnType<typeof json> {
  switch (scenario.projects) {
    case "empty":
      return json(200, [...createdProjects]);
    case "internal":
      return json(500, { defined: false, code: "INTERNAL", message: "Internal error" });
    case "unauthorized":
      // Session expirée : l'API la refuse ensuite aussi à /login (sinon le garde renverrait vers /projects).
      scenario.session = false;
      return json(401, { defined: false, code: "UNAUTHORIZED", message: "Unauthorized" });
    default:
      return json(200, [...PROJECTS, ...createdProjects]);
  }
}

/** Échec de `project.cards` selon le scénario de la liste : erreur serveur ou session expirée (null : réponse normale). */
function cardsFailure(mode: string): ReturnType<typeof json> | null {
  if (mode === "internal" || mode === "unauthorized") return projectsResponse();
  return null;
}

/** Better Auth : `get-invitation` et `organization/list` pour l'écran d'acceptation. */
function invitationEndpoint(path: string): ReturnType<typeof json> | null {
  const mode = scenario.invitation;
  if (path.endsWith("/get-invitation")) {
    if (mode === "ready" || mode === "member") {
      return json(200, {
        id: "01900000-0000-7000-8000-0000000000d1",
        organizationId: ORG_ID,
        organizationName: "Atelier Lumière",
        role: "dev",
        inviterEmail: "awa@example.com",
      });
    }
    if (mode === "wrong") {
      return json(403, { code: "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION" });
    }
    return json(400, { code: "INVITATION_NOT_FOUND" });
  }
  if (path.endsWith("/organization/list")) {
    return json(200, mode === "member" ? [{ id: ORG_ID, name: "Atelier Lumière" }] : []);
  }
  return null;
}

/** Lectures simples (organisations, membres) ; le reste est inconnu du faux API. */
function readEndpoint(method: string | undefined, path: string): ReturnType<typeof json> {
  if (method === "GET" && path.endsWith("/organizations")) return json(200, organizations());
  return json(404, { code: "NOT_FOUND" });
}

type Send = (reply: ReturnType<typeof json>) => void;

/** Pilotage du faux API : POST /__scenario (état à servir) et POST /__release (réponses retenues). */
function handleControl(req: IncomingMessage, path: string, send: Send): boolean {
  if (req.method !== "POST") return false;
  if (path === "/__release") {
    for (const release of held.splice(0)) release();
    send(json(200, { released: true }));
    return true;
  }
  if (path !== "/__scenario") return false;
  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
  });
  req.on("end", () => {
    scenario = JSON.parse(raw) as Scenario;
    resetKanban();
    resetGithub();
    resetSpecRepo();
    resetFeatures();
    resetProposals(scenario);
    resetProviders();
    resetSettings();
    resetMembers();
    resetShell(scenario);
    resetIdea(scenario);
    if (!scenario.keepProjects) createdProjects.length = 0;
    seedCreation(scenario, addProject);
    send(json(200, scenario));
  });
  return true;
}

const hold = (release: () => void) => void held.push(release);
const expireSession = () => {
  scenario.session = false;
};

const allProjects = () => [...PROJECTS, ...createdProjects];
const knownProject = (id: string) => allProjects().some((project) => project.id === id);

/**
 * Appels à l'IA (`ai.*`), fournisseurs d'IA (`aiProvider.*`, `aiSettings.*`...) : même modèle simulé, jamais de fournisseur réel ;
 * puis la coquille (`project.shell|visit|recent`, `search.query`).
 */
const handleAiApis = (req: IncomingMessage, url: URL, send: Send): boolean =>
  handleSettings(req, url, { scenario, send, projects: allProjects }) ||
  handleProviders(req, url, { scenario, send, hold }) ||
  handleProposals(req, url, { scenario, send }) ||
  handleOverview(req, url, { scenario, send, hold }) ||
  handleShell(req, url, { scenario, projects: allProjects, send, hold });

type Sender = (reply: ReturnType<typeof json>) => void;

/** Le reste du faux API : fonctionnalités, dépôt de spec, projets, kanban, GitHub, organisations. */
function handleRest(req: IncomingMessage, url: URL, send: Sender): void {
  const path = url.pathname;
  if (handleFeatures(req, url, { scenario, knownProject, send, hold })) return;
  if (
    handleSpecRepo(req, path, {
      scenario,
      send,
      hold,
      addProject,
      onSpecRepoCreated: markSpecRepoCreated,
    })
  )
    return;
  if (
    handleProjectCards(req, url, {
      scenario,
      projects: () => (scenario.projects === "empty" ? createdProjects : allProjects()),
      send,
      hold,
      failure: cardsFailure,
    })
  )
    return;
  if (path.endsWith("/projects")) {
    if (scenario.projects === "loading") held.push(() => send(projectsResponse()));
    else send(projectsResponse());
    return;
  }
  if (handleKanban(req, url, scenario, send, hold, expireSession, { knownProject })) return;
  if (handleGithub(req, path, scenario, send, hold)) return;
  send(invitationEndpoint(path) ?? readEndpoint(req.method, path));
}

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://stub");
  const path = url.pathname;
  const send = ({ status, body }: ReturnType<typeof json>) => {
    res.writeHead(status, { "content-type": "application/json" }).end(body);
  };
  if (path === "/__health") return send(json(200, { ok: true }));
  if (handleControl(req, path, send) || handleIdea(req, res, url, scenario.role)) return;
  if (path.endsWith("/get-session")) return send(json(200, scenario.session ? session() : null));
  if (handleAiApis(req, url, send)) return;
  handleRest(req, url, send);
}).listen(Number(process.env.STUB_API_PORT ?? 3101), "127.0.0.1");
