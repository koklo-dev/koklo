import { randomUUID } from "node:crypto";
import type { PullRequestState } from "@koklo/domain";
import { BOT } from "./spec-write-bench.ts";
import type { WebhookBench, WebhookScene } from "./webhook-bench.ts";

/**
 * Aides des tests d'intégration de TK-46b (passe P3 : PR fusionnées à la main, incident 10).
 *
 * Contrat attendu de la production (décisions du Red) :
 *  - `Ticket.pullRequest` = URL `https://github.com/<owner>/<repo>/pull/<n>` ;
 *  - P3 lit les tickets `in_review` non supprimés dont la PR est lisible et le dépôt est lié (même
 *    projet, mêmes `owner_login`/`name`, installation `active`), appelle `authenticate` (une fois par
 *    installation et par run) puis `getPullRequestState` (une fois par ticket et par run) ;
 *  - PR `merged` : mise à jour conditionnelle `in_review` -> `done`, baux ouverts libérés, audit
 *    système `ticket.reconcile.pr_merged` (cible = ticket, `ticket_id` = ticket), tout dans la même
 *    transaction ; PR `closed` : statut inchangé, audit unique `ticket.reconcile.pr_closed` ;
 *  - bilan : `prs: { done, closed, skipped, reasons }` (nombres seulement) ; la panne de la passe est
 *    nommée `"prs"` dans `failedPasses`.
 */
export type Tx = { id: string; key: string };

const MINUTE = 60_000;

/** Lien de PR tel que la production l'attend dans `Ticket.pullRequest`. */
export const prUrl = (scene: WebhookScene, number: number): string =>
  `https://github.com/${scene.owner.login}/${scene.ref.name}/pull/${number}`;

/** Une PR ouverte dans le faux (branche + commit + PR) ; rend son numéro et la tête de la PR. */
export async function openPullRequest(
  bench: WebhookBench,
  scene: WebhookScene,
  label = randomUUID().slice(0, 8),
): Promise<{ number: number; headSha: string }> {
  const inner = bench.spy.inner;
  const auth = await bench.spy.auth(scene.owner);
  const { defaultBranch } = await inner.getRepo({ auth, repo: scene.ref });
  const base = (await inner.listFiles({ auth, repo: scene.ref, ref: defaultBranch })).ref;
  const head = `feat/${label}`;
  await inner.createBranch({ auth, repo: scene.ref, base, name: head });
  const commit = await inner.writeCommit({
    auth,
    repo: scene.ref,
    branch: head,
    files: [{ path: `src/${label}.txt`, content: label }],
    author: BOT,
    message: `feat: ${label}`,
  });
  const pull = await inner.createPullRequest({
    auth,
    repo: scene.ref,
    base: defaultBranch,
    head,
    title: `feat: ${label}`,
    body: "",
  });
  return { number: pull.ref.number, headSha: commit.sha };
}

/** Fusion « à la main » côté fournisseur : le worker n'y est pour rien. */
export async function mergeByHand(
  bench: WebhookBench,
  scene: WebhookScene,
  pr: { number: number; headSha: string },
): Promise<void> {
  const auth = await bench.spy.auth(scene.owner);
  await bench.spy.inner.mergePullRequest({
    auth,
    pullRequest: { repo: scene.ref, number: pr.number },
    method: "squash",
    expectedHeadSha: pr.headSha,
  });
}

/**
 * Le faux ne sait pas fermer une PR sans la fusionner : on fait rapporter `closed` aux PR dont le
 * numéro est donné (dépôt `repoName`). Rend la fonction de remise en état.
 */
export function reportClosed(bench: WebhookBench, repoName: string, numbers: number[]): () => void {
  const inner = bench.spy.inner;
  const original = inner.getPullRequestState.bind(inner);
  inner.getPullRequestState = async (request) => {
    const state: PullRequestState = await original(request);
    const closed =
      request.pullRequest.repo.name === repoName && numbers.includes(request.pullRequest.number);
    return closed ? { ...state, status: "closed" } : state;
  };
  return () => {
    inner.getPullRequestState = original;
  };
}

export interface TicketInput {
  status?: string;
  pullRequest?: string | null;
  deletedAt?: Date | null;
  projectId?: string;
}

/** Ticket valide (CHECK, enums, unicité projet+clé respectés) ; rend son id et sa clé. */
export async function insertTicket(
  bench: WebhookBench,
  scene: Pick<WebhookScene, "organizationId" | "projectId">,
  over: TicketInput = {},
): Promise<Tx> {
  const id = randomUUID();
  const key = `TK-${Math.floor(Math.random() * 1e9)}`;
  await bench.query(
    `INSERT INTO tickets (id, organization_id, project_id, key, title, description, type, status, priority, pkg, sensitivity, pull_request, deleted_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'Ticket', 'Description', 'task', $5::ticket_status, 'medium', 'worker', 'safe', $6, $7, now(), now())`,
    [
      id,
      scene.organizationId,
      over.projectId ?? scene.projectId,
      key,
      over.status ?? "in_review",
      over.pullRequest ?? null,
      over.deletedAt ?? null,
    ],
  );
  return { id, key };
}

/** Bail ouvert (`released_at` nul) tenu par le runner sur le ticket. */
export async function openLease(
  bench: WebhookBench,
  scene: Pick<WebhookScene, "organizationId">,
  ticketId: string,
): Promise<string> {
  const id = randomUUID();
  const acquired = new Date(Date.now() - 5 * MINUTE);
  await bench.query(
    `INSERT INTO leases (id, organization_id, ticket_id, holder_kind, holder_id, branch, worktree, acquired_at, heartbeat_at, expires_at, ttl_ms, created_at, updated_at)
     VALUES ($1, $2, $3, 'runner', 'runner-1', 'feat/x', '/tmp/wt', $4, $4, $5, 900000, now(), now())`,
    [id, scene.organizationId, ticketId, acquired, new Date(Date.now() + 10 * MINUTE)],
  );
  return id;
}

export async function statusOf(bench: WebhookBench, ticketId: string): Promise<string | undefined> {
  const [row] = await bench.query<{ status: string }>(
    "SELECT status::text AS status FROM tickets WHERE id = $1",
    [ticketId],
  );
  return row?.status;
}

export async function leaseReleased(bench: WebhookBench, leaseId: string): Promise<boolean> {
  const [row] = await bench.query<{ released_at: Date | null }>(
    "SELECT released_at FROM leases WHERE id = $1",
    [leaseId],
  );
  return row?.released_at != null;
}

export type AuditRow = {
  actor_kind: string;
  actor_id: string | null;
  action: string;
  target_kind: string;
  target_id: string;
  ticket_id: string | null;
  organization_id: string;
};

/** Audit d'une organisation (`audit_log` est immuable et jamais vidé : on filtre par organisation). */
export async function auditOf(
  bench: WebhookBench,
  organizationId: string,
  like = "ticket.reconcile.%",
): Promise<AuditRow[]> {
  return bench.query<AuditRow>(
    `SELECT actor_kind::text AS actor_kind, actor_id, action, target_kind, target_id, ticket_id, organization_id
     FROM audit_log WHERE organization_id = $1 AND action LIKE $2 ORDER BY occurred_at, id`,
    [organizationId, like],
  );
}

export async function ticketUpdatedAt(bench: WebhookBench, ticketId: string): Promise<Date> {
  const [row] = await bench.query<{ updated_at: Date }>(
    "SELECT updated_at FROM tickets WHERE id = $1",
    [ticketId],
  );
  if (!row) throw new Error(`ticket ${ticketId} absent`);
  return row.updated_at;
}
