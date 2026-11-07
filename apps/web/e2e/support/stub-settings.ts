import type { IncomingMessage } from "node:http";
import { handleMembers, type MembersScenario } from "./stub-members.ts";

/**
 * Faux API de Réglages (TK-97, contrat 2.2.0), lot B : `org.get|update` et `me.*`, sans Postgres.
 * Le rôle vient du scénario (`role`, propriétaire par défaut) ; `org.get` est refusé au client (403).
 * L'adresse « pris » est toujours refusée (`CONFLICT slug_taken`).
 */
export type SettingsScenario = { role?: string } & MembersScenario;

type Reply = { status: number; body: string };
type Send = (reply: Reply) => void;
const reply = (status: number, body: unknown): Reply => ({ status, body: JSON.stringify(body) });
const typed = (status: number, code: string, data?: unknown): Reply =>
  reply(status, { defined: true, code, message: code, ...(data === undefined ? {} : { data }) });

const TEAM = ["client_validation", "pr_to_review", "agent_silent", "ai_budget", "weekly_digest"];
const CLIENT = ["deliverable_to_validate", "feature_ready", "comment_reply"];

let preferences = new Map<string, boolean>();
let myName = "Awa Koné";

export function resetSettings(): void {
  preferences = new Map([["weekly_digest", false]]);
  myName = "Awa Koné";
}
resetSettings();

const readBody = (req: IncomingMessage, done: (body: Record<string, unknown>) => void): void => {
  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
  });
  req.on("end", () => done(raw ? (JSON.parse(raw) as Record<string, unknown>) : {}));
};

const me = (role: string) => ({
  id: "01900000-0000-7000-8000-0000000000c1",
  name: myName,
  email: "awa@example.com",
  role,
});

type Context = {
  scenario: SettingsScenario;
  send: Send;
  projects: () => Array<{ id: string; name: string }>;
};

function organization(role: string, { send }: Context): void {
  send(
    role === "client"
      ? typed(403, "FORBIDDEN")
      : reply(200, {
          id: "01900000-0000-7000-8000-0000000000a1",
          name: "Atelier Lumière",
          slug: "atelier-lumiere",
          logo: null,
          projectCount: 3,
          memberCount: 5,
          aiProviderCount: 1,
        }),
  );
}

function updateOrganization(req: IncomingMessage, { send }: Context): void {
  readBody(req, (body) => {
    send(
      body.slug === "pris"
        ? typed(409, "CONFLICT", { reason: "slug_taken" })
        : reply(200, { id: "01900000-0000-7000-8000-0000000000a1", ...body }),
    );
  });
}

function notifications(role: string): Array<{ key: string; enabled: boolean }> {
  return (role === "client" ? CLIENT : TEAM).map((key) => ({
    key,
    enabled: preferences.get(key) ?? true,
  }));
}

/** Gère `/me…` (profil et préférences d'e-mail) ; false pour tout autre chemin. */
function handleMe(req: IncomingMessage, pathname: string, { scenario, send }: Context): boolean {
  const role = scenario.role ?? "owner";
  const key = /\/me\/notifications\/([a-z_]+)$/.exec(pathname)?.[1];
  if (key && req.method === "PUT") {
    readBody(req, (body) => {
      preferences.set(key, body.enabled === true);
      send(reply(200, { key, enabled: body.enabled === true }));
    });
  } else if (pathname.endsWith("/me/notifications") && req.method === "GET") {
    send(reply(200, notifications(role)));
  } else if (pathname.endsWith("/me") && req.method === "GET") {
    send(reply(200, me(role)));
  } else if (pathname.endsWith("/me") && req.method === "PATCH") {
    readBody(req, (body) => {
      myName = typeof body.name === "string" ? body.name : myName;
      send(reply(200, me(role)));
    });
  } else return false;
  return true;
}

/** Gère `/organization`, `/me…`, Membres et invitations ; false pour tout autre chemin. */
export function handleSettings(req: IncomingMessage, url: URL, context: Context): boolean {
  const { pathname } = url;
  if (handleMembers(req, url, context)) return true;
  if (pathname.endsWith("/organization")) {
    if (req.method === "GET") organization(context.scenario.role ?? "owner", context);
    else if (req.method === "PATCH") updateOrganization(req, context);
    else return false;
    return true;
  }
  return handleMe(req, pathname, context);
}
