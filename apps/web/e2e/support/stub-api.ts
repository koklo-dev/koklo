import { createServer } from "node:http";

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
};

let scenario: Scenario = { session: true, projects: "data" };
const held: Array<() => void> = [];

const PROJECTS = [
  { id: "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b01", name: "Atelier Lumière" },
  { id: "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b02", name: "Plateforme de réservation" },
  { id: "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b03", name: "Portail partenaires" },
];

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
const MEMBERS = [
  {
    id: "01900000-0000-7000-8000-0000000000b1",
    userId: "01900000-0000-7000-8000-0000000000c1",
    name: "Awa Koné",
    email: "awa@example.com",
    role: "owner",
  },
  {
    id: "01900000-0000-7000-8000-0000000000b2",
    userId: "01900000-0000-7000-8000-0000000000c2",
    name: "Moussa Diallo",
    email: "moussa@example.com",
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
  return mode === "many" ? ORGANIZATIONS : ORGANIZATIONS.slice(0, 1);
}

const json = (status: number, body: unknown) => ({ status, body: JSON.stringify(body) });

function projectsResponse(): ReturnType<typeof json> {
  switch (scenario.projects) {
    case "empty":
      return json(200, []);
    case "internal":
      return json(500, { defined: false, code: "INTERNAL", message: "Internal error" });
    case "unauthorized":
      // Session expirée : l'API la refuse ensuite aussi à /login (sinon le garde renverrait vers /projects).
      scenario.session = false;
      return json(401, { defined: false, code: "UNAUTHORIZED", message: "Unauthorized" });
    default:
      return json(200, PROJECTS);
  }
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
  if (method === "GET" && path.endsWith("/members")) return json(200, MEMBERS);
  return json(404, { code: "NOT_FOUND" });
}

createServer((req, res) => {
  const path = new URL(req.url ?? "/", "http://stub").pathname;
  const send = ({ status, body }: ReturnType<typeof json>) => {
    res.writeHead(status, { "content-type": "application/json" }).end(body);
  };
  if (path === "/__health") return send(json(200, { ok: true }));
  if (req.method === "POST" && path === "/__scenario") {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      scenario = JSON.parse(raw) as Scenario;
      send(json(200, scenario));
    });
    return;
  }
  if (req.method === "POST" && path === "/__release") {
    for (const release of held.splice(0)) release();
    return send(json(200, { released: true }));
  }
  if (path.endsWith("/get-session")) return send(json(200, scenario.session ? session() : null));
  if (path.endsWith("/projects")) {
    if (scenario.projects === "loading") return void held.push(() => send(projectsResponse()));
    return send(projectsResponse());
  }
  send(invitationEndpoint(path) ?? readEndpoint(req.method, path));
}).listen(Number(process.env.STUB_API_PORT ?? 3101), "127.0.0.1");
