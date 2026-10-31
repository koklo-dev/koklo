import type { IncomingMessage } from "node:http";

/**
 * Faux API de l'écran /github (TK-48b) : installation.list et installation.start, sans Postgres.
 * C'est le faux fournisseur des e2e : l'URL « GitHub » renvoyée par `start` n'est jamais jointe, le test
 * intercepte la navigation côté navigateur (`page.route`). Aucune requête ne part vers github.com.
 */
export type InstallationsMode = "loading" | "empty" | "data" | "internal" | "single";
export type StartMode = "ok" | "unavailable" | "tooManyPending" | "badUrl";
export type GithubScenario = { installations?: InstallationsMode; start?: StartMode };

type Reply = { status: number; body: string };
type Send = (reply: Reply) => void;
const reply = (status: number, body: unknown): Reply => ({ status, body: JSON.stringify(body) });

export const FAKE_GITHUB_URL =
  "https://github.com/apps/koklo-e2e/installations/new?state=e2e.state";
const ID = (n: number) => `01900000-0000-7000-8000-0000000001${String(n).padStart(2, "0")}`;

const installation = (n: number, over: Record<string, unknown>) => ({
  id: ID(n),
  provider: "github",
  ownerKind: "organization",
  ownerLogin: "acme-corp",
  status: "active",
  userAuthorization: "active",
  createdAt: "2026-10-20T10:00:00.000Z",
  ...over,
});

const DATA = [
  installation(1, {}),
  installation(2, { ownerKind: "user", ownerLogin: "awa-kone", userAuthorization: "absent" }),
  installation(3, { ownerLogin: "vieux-studio", userAuthorization: "expired" }),
  installation(4, { ownerLogin: "pause-sa", status: "suspended" }),
  installation(5, { ownerLogin: "parti-sas", status: "deleted" }),
];

const starts: unknown[] = [];

export function resetGithub(): void {
  starts.length = 0;
}

function listResponse(mode: InstallationsMode): Reply {
  if (mode === "internal") {
    return reply(500, { defined: false, code: "INTERNAL", message: "Internal error" });
  }
  if (mode === "single") return reply(200, [DATA[0], DATA[3], DATA[4]]);
  return reply(200, mode === "empty" ? [] : DATA);
}

function startResponse(mode: StartMode): Reply {
  switch (mode) {
    case "unavailable":
      return reply(503, { defined: true, code: "PROVIDER_UNAVAILABLE", message: "Unavailable" });
    case "tooManyPending":
      return reply(422, {
        defined: true,
        code: "VALIDATION",
        message: "Entrée invalide",
        data: { field: "installationId", message: "too_many_pending" },
      });
    case "badUrl":
      return reply(200, {
        url: "https://evil.example/phish",
        expiresAt: "2026-10-31T12:10:00.000Z",
      });
    default:
      return reply(200, { url: FAKE_GITHUB_URL, expiresAt: "2026-10-31T12:10:00.000Z" });
  }
}

export function handleGithub(
  req: IncomingMessage,
  path: string,
  scenario: GithubScenario,
  send: Send,
  hold: (release: () => void) => void,
): boolean {
  if (path === "/__github-starts") {
    send(reply(200, starts));
    return true;
  }
  const mode = scenario.installations ?? "empty";
  if (req.method === "GET" && path.endsWith("/provider/installations")) {
    if (mode === "loading") hold(() => send(listResponse("data")));
    else send(listResponse(mode));
    return true;
  }
  if (req.method !== "POST" || !path.endsWith("/provider/installations/start")) return false;
  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
  });
  req.on("end", () => {
    starts.push(JSON.parse(raw || "{}"));
    send(startResponse(scenario.start ?? "ok"));
  });
  return true;
}
