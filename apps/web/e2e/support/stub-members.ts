import type { IncomingMessage } from "node:http";

/**
 * Faux API de Membres (TK-97, contrat 2.2.0), lot C : `member.page|updateRole|remove` et `invitation.*`.
 * Deux membres de base (Awa, propriétaire et « soi » ; Moussa, développeur) ; le scénario `members: "many"`
 * en ajoute 57 pour la pagination. Les écritures modifient l'état, remis à zéro à chaque scénario.
 */
export type MembersScenario = { members?: "many" };

type Reply = { status: number; body: string };
type Project = { id: string; name: string };
type Member = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  projects: Project[];
  lastActiveAt: string | null;
};
type Invitation = {
  id: string;
  email: string;
  role: string;
  status: "pending";
  expiresAt: string;
  invitedBy: string;
  projects: Project[];
};
export type MembersContext = {
  scenario: MembersScenario;
  projects: () => Project[];
  send: (reply: Reply) => void;
};

const reply = (status: number, body: unknown): Reply => ({ status, body: JSON.stringify(body) });
const typed = (status: number, code: string, data?: unknown): Reply =>
  reply(status, { defined: true, code, message: code, ...(data === undefined ? {} : { data }) });
const uuid = (n: number): string => `01900000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;

const BASE: Member[] = [
  {
    id: uuid(0xb1),
    userId: uuid(0xc1),
    name: "Awa Koné",
    email: "awa@example.com",
    role: "owner",
    projects: [],
    lastActiveAt: "2026-11-07T08:00:00.000Z",
  },
  {
    id: uuid(0xb2),
    userId: uuid(0xc2),
    name: "Moussa Diallo",
    email: "moussa@example.com",
    role: "dev",
    projects: [],
    lastActiveAt: null,
  },
];

const fresh = (): Member[] => BASE.map((member) => ({ ...member }));
let members: Member[] = fresh();
let invitations: Invitation[] = [];
let sequence = 0;
let seededFor: MembersScenario["members"];

export function resetMembers(): void {
  members = fresh();
  invitations = [];
  sequence = 0;
  seededFor = undefined;
}

function seed(scenario: MembersScenario): void {
  if (scenario.members === seededFor) return;
  seededFor = scenario.members;
  if (scenario.members !== "many") return;
  for (let index = 1; index <= 57; index++) {
    members.push({
      id: uuid(0x1000 + index),
      userId: uuid(0x2000 + index),
      name: `Membre ${String(index).padStart(2, "0")}`,
      email: `membre${index}@example.com`,
      role: "designer",
      projects: [],
      lastActiveAt: null,
    });
  }
}

const readBody = (req: IncomingMessage, done: (body: Record<string, unknown>) => void): void => {
  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
  });
  req.on("end", () => done(raw ? (JSON.parse(raw) as Record<string, unknown>) : {}));
};

function page(url: URL, { send }: MembersContext): void {
  const number = Number(url.searchParams.get("page") ?? 1);
  const size = Number(url.searchParams.get("size") ?? 25);
  send(
    reply(200, {
      items: members.slice((number - 1) * size, number * size),
      total: members.length,
      totalIsEstimate: false,
    }),
  );
}

function createInvitation(req: IncomingMessage, { send, projects }: MembersContext): void {
  readBody(req, (body) => {
    const email = String(body.email);
    if (members.some((member) => member.email === email)) {
      return send(typed(409, "CONFLICT", { reason: "already_member" }));
    }
    if (invitations.some((invitation) => invitation.email === email)) {
      return send(typed(409, "CONFLICT", { reason: "already_invited" }));
    }
    const ids = Array.isArray(body.projectIds) ? (body.projectIds as string[]) : [];
    sequence += 1;
    const created: Invitation = {
      id: uuid(0x3000 + sequence),
      email,
      role: String(body.role),
      status: "pending",
      expiresAt: "2026-11-14T10:00:00.000Z",
      invitedBy: "Awa Koné",
      projects: projects().filter((project) => ids.includes(project.id)),
    };
    invitations.push(created);
    send(reply(200, created));
  });
}

function updateRole(req: IncomingMessage, id: string, { send }: MembersContext): void {
  readBody(req, (body) => {
    const member = members.find((candidate) => candidate.id === id);
    if (!member) return send(typed(404, "NOT_FOUND"));
    member.role = String(body.role);
    send(reply(200, { id, role: member.role }));
  });
}

function invitationRoute(req: IncomingMessage, path: string, { send }: MembersContext): boolean {
  const match = /\/invitations\/([0-9a-f-]+)(\/resend)?$/.exec(path);
  if (!match?.[1]) return false;
  const found = invitations.find((invitation) => invitation.id === match[1]);
  if (!found) send(typed(404, "NOT_FOUND"));
  else if (req.method === "POST" && match[2]) send(reply(200, found));
  else if (req.method === "DELETE") {
    invitations = invitations.filter((invitation) => invitation !== found);
    send(reply(200, { id: found.id }));
  } else return false;
  return true;
}

function memberRoute(req: IncomingMessage, path: string, context: MembersContext): boolean {
  const id = /\/members\/([0-9a-f-]+)$/.exec(path)?.[1];
  if (!id) return false;
  if (req.method === "PATCH") updateRole(req, id, context);
  else if (req.method === "DELETE") {
    members = members.filter((member) => member.id !== id);
    context.send(reply(200, { id }));
  } else return false;
  return true;
}

/** Gère `/members/page`, `/members/{id}` et `/invitations…` ; false pour tout autre chemin. */
export function handleMembers(req: IncomingMessage, url: URL, context: MembersContext): boolean {
  seed(context.scenario);
  const { pathname } = url;
  if (pathname.endsWith("/members/page") && req.method === "GET") page(url, context);
  else if (pathname.endsWith("/invitations") && req.method === "GET") {
    context.send(reply(200, invitations));
  } else if (pathname.endsWith("/invitations") && req.method === "POST") {
    createInvitation(req, context);
  } else return invitationRoute(req, pathname, context) || memberRoute(req, pathname, context);
  return true;
}
