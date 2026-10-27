import { createServer } from "node:http";

/**
 * Faux API pour les e2e : session Better Auth + project.list, sans Postgres.
 * Piloté par POST /__scenario { session: boolean, projects: "loading"|"empty"|"data"|"internal"|"unauthorized" }.
 * "loading" retient la réponse jusqu'à POST /__release (capture de l'état de chargement).
 */
type Scenario = {
  session: boolean;
  projects: "loading" | "empty" | "data" | "internal" | "unauthorized";
};

let scenario: Scenario = { session: true, projects: "data" };
const held: Array<() => void> = [];

const PROJECTS = [
  { id: "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b01", name: "Atelier Lumière" },
  { id: "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b02", name: "Plateforme de réservation" },
  { id: "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b03", name: "Portail partenaires" },
];

const SESSION = {
  session: { id: "s1", userId: "u1", expiresAt: "2999-01-01T00:00:00.000Z", token: "t" },
  user: { id: "u1", name: "Test", email: "test@example.com", emailVerified: true },
};

const json = (status: number, body: unknown) => ({ status, body: JSON.stringify(body) });

function projectsResponse(): ReturnType<typeof json> {
  switch (scenario.projects) {
    case "empty":
      return json(200, []);
    case "internal":
      return json(500, { code: "INTERNAL", status: 500, message: "Internal error" });
    case "unauthorized":
      return json(401, { code: "UNAUTHORIZED", status: 401, message: "Unauthorized" });
    default:
      return json(200, PROJECTS);
  }
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
  if (path.endsWith("/get-session")) return send(json(200, scenario.session ? SESSION : null));
  if (path.endsWith("/projects")) {
    if (scenario.projects === "loading") return void held.push(() => send(projectsResponse()));
    return send(projectsResponse());
  }
  send(json(404, { code: "NOT_FOUND" }));
}).listen(Number(process.env.STUB_API_PORT ?? 3101), "127.0.0.1");
