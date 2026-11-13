import type { IncomingMessage } from "node:http";
import { clientDataReply } from "./stub-spec-data.ts";

/**
 * Faux API de la validation du modèle de données (TK-109, contrat 3.7.0) : décision `review.submit|list` du livrable
 * `data`, statut et impact amont de `spec.deliverables`, commentaires de table (`comment.list`). Pilotage :
 * `dataModel` (« pending » : à valider, « validated » : déjà validé par Moussa, « revise » : F-002 et R-004 modifiées
 * depuis la décision) et `dataComments` (remarques du client sur la table Client). Sans `dataModel`, le livrable reste
 * « todo » comme avant TK-109. Aucune donnée réelle.
 */
export type DataModelMode = "pending" | "validated" | "revise";
export type DataModelScenario = {
  dataModel?: DataModelMode;
  dataComments?: boolean;
  /** Jeu de spec (`large*` : 80 tables) : les lectures du client suivent le même jeu que l'équipe. */
  spec?: string;
};

type Reply = { status: number; body: string };
type Send = (reply: Reply) => void;
const reply = (status: number, body: unknown): Reply => ({ status, body: JSON.stringify(body) });

const DECISION_ID = "01900000-0000-7000-8000-0000000000d1";
const COMMENT_ID = "01900000-0000-7000-8000-0000000000e2";
let validated = false;

export function resetDataModel(scenario: DataModelScenario): void {
  validated = scenario.dataModel === "validated";
}

/** Statut et impact amont du livrable Données dans `spec.deliverables` ; `undefined` : comportement d'avant TK-109. */
export function dataDeliverable(
  scenario: DataModelScenario,
): { status: string; staleUpstream?: string[] } | undefined {
  if (!scenario.dataModel) return undefined;
  if (validated) return { status: "validated" };
  return scenario.dataModel === "revise"
    ? { status: "revise", staleUpstream: ["F-002", "R-004"] }
    : { status: "pending" };
}

const decision = (projectId: string) => ({
  id: DECISION_ID,
  targetKind: "deliverable",
  targetRef: "data",
  sha: "3c7e1a9".padEnd(40, "0"),
  status: "approved",
  authorId: "01900000-0000-7000-8000-0000000000a1",
  authorName: "Moussa",
  authorRole: "owner",
  comment: null,
  createdAt: "2026-11-05T10:00:00.000Z",
  current: true,
  withoutClient: false,
  projectId,
});

const REMARKS = [
  {
    id: "01900000-0000-7000-8000-0000000000e1",
    targetKind: "table",
    targetId: "01900000-0000-7000-8000-000000000001",
    targetRef: "T-client",
    authorKind: "client",
    authorId: "client-1",
    body: "Il manque le numéro de carte fidélité, on en parle souvent au comptoir.",
    createdAt: "2026-11-11T09:30:00.000Z",
  },
];

function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => resolve(raw ? JSON.parse(raw) : {}));
  });
}

/** Lectures client du modèle (validé seulement quand `dataModel` vaut « validated ») ; `false` pour toute autre route. */
function handleClientData(url: URL, h: { scenario: DataModelScenario; send: Send }): boolean {
  const found = clientDataReply(url, h.scenario.spec ?? "", h.scenario.dataModel === "validated");
  if (found) h.send(found);
  return found !== null;
}

type Handlers = { scenario: DataModelScenario; send: Send };

/** Commentaires de table : lecture des remarques du client, envoi d'un commentaire. */
function handleComments(req: IncomingMessage, url: URL, h: Handlers): boolean {
  if (req.method === "GET") {
    const items = h.scenario.dataComments && url.searchParams.get("targetRef") === "T-client";
    h.send(reply(200, { items: items ? REMARKS : [], nextCursor: null }));
    return true;
  }
  if (req.method !== "POST") return false;
  void body(req).then((input) => {
    h.send(reply(200, { ...REMARKS[0], id: COMMENT_ID, body: String(input.body ?? "") }));
  });
  return true;
}

/** Décisions du livrable Données : la liste (« Validé par ») et la validation. */
function handleReviews(req: IncomingMessage, projectId: string, h: Handlers): boolean {
  if (!h.scenario.dataModel) return false;
  if (req.method === "GET") {
    h.send(reply(200, { items: validated ? [decision(projectId)] : [], nextCursor: null }));
    return true;
  }
  if (req.method !== "POST") return false;
  void body(req).then(() => {
    validated = true;
    h.send(
      reply(200, {
        id: DECISION_ID,
        status: "approved",
        validation: "validated",
        createdAt: "2026-11-05T10:00:00.000Z",
      }),
    );
  });
  return true;
}

/** Décisions et commentaires de table ; `false` pour toute autre route (le faux API de la vue client prend la suite). */
export function handleDataModel(req: IncomingMessage, url: URL, h: Handlers): boolean {
  if (req.method === "GET" && handleClientData(url, h)) return true;
  const match = /^\/projects\/([^/]+)\/(reviews|comments)$/.exec(url.pathname);
  if (!match) return false;
  return match[2] === "comments"
    ? handleComments(req, url, h)
    : handleReviews(req, match[1] ?? "", h);
}
