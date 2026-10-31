import { randomUUID } from "node:crypto";
import { GitNotFoundError } from "@koklo/domain";
import { auditOf } from "./reconcile-pr-bench.ts";
import type { WebhookBench, WebhookScene } from "./webhook-bench.ts";

/**
 * Aides des tests d'intégration de TK-46c (passe P4 : index des têtes de spec, budget d'appels,
 * rotation, arrêt sur limite de débit).
 *
 * Contrat attendu de la production (décisions du Red) :
 *  - P4 réconcilie, pour chaque dépôt qui porte une spec (rôle `spec` ou `spec_path` non nul) d'une
 *    installation `active`, la branche par défaut (`project_repos.default_branch`) et les têtes
 *    connues (`spec_heads`), en appelant `indexBranch` (extrait de `webhook/push.ts`) ; dépôts triés
 *    par `last_reconciled_at` croissant (NULL d'abord), un à la fois, séquentiellement ;
 *  - `last_reconciled_at` est avancé quand le dépôt est terminé (y compris dépôt injoignable), jamais
 *    quand il est interrompu (limite de débit, budget épuisé) ou sauté sur erreur fournisseur ;
 *  - audit système (`actor_kind=system`, `actor_id` nul, `target_kind=repo`, `target_id` = id du
 *    dépôt) SEULEMENT si l'état change : `repo.reconcile.head_updated` (tête créée ou déplacée),
 *    `repo.reconcile.head_removed` (branche disparue, dépôt vérifié par `getRepo`),
 *    `repo.reconcile.unreachable` (dépôt 404 : tête conservée, UN seul audit, jamais dupliqué) ;
 *  - budget `WorkerConfig.reconcileMaxProviderCalls` (`RECONCILE_MAX_PROVIDER_CALLS`, 10 à 5000,
 *    défaut 300) : nombre maximal d'appels fournisseur de P4 par run, authenticate compris ;
 *  - bilan : `heads: { updated, removed, unreachable, skipped, stopped }` où `stopped` vaut
 *    `"rate_limited"`, `"budget"` ou `null` ; la panne d'une passe se nommerait `"heads"` dans
 *    `failedPasses`, mais une erreur fournisseur ne fait JAMAIS échouer la passe : le dépôt est
 *    sauté (`skipped`) et le suivant est traité.
 */
export const missingRef = () =>
  new GitNotFoundError({ operation: "listFiles", resource: "ref", identifier: "r@cadrage" });
export const missingRepository = (identifier = "a/b") =>
  new GitNotFoundError({ operation: "getRepo", resource: "repository", identifier });

/**
 * Remet le banc à blanc côté dépôts : les dépôts des scènes précédentes quitteraient le décompte
 * d'appels et l'ordre de rotation. `audit_log` est immuable : on filtre par organisation.
 */
export async function clearRepos(bench: WebhookBench): Promise<void> {
  await bench.query("DELETE FROM spec_write_operations");
  await bench.query("DELETE FROM spec_write_batches");
  await bench.query("DELETE FROM project_repos");
  bench.repoints.clear();
}

/**
 * Retire le dépôt de la scène du périmètre de P4 (ni rôle `spec`, ni `spec_path`) : un test qui compte
 * les appels fournisseur de P3 ne voit alors pas l'authentification de P4. P3 lie le dépôt sans égard
 * au rôle.
 */
export async function detachFromHeads(bench: WebhookBench, scene: WebhookScene): Promise<void> {
  await bench.query("UPDATE project_repos SET role = 'front', spec_path = NULL WHERE id = $1", [
    scene.repoId,
  ]);
}

/** Les appels fournisseur de la scène se reconnaissent à son dépôt ou à son propriétaire. */
export function touches(request: Record<string, unknown>, scene: WebhookScene): boolean {
  const repo = request.repo as { name?: string } | undefined;
  const installation = request.installation as { owner?: { login?: string } } | undefined;
  return repo?.name === scene.ref.name || installation?.owner?.login === scene.owner.login;
}

/** Fait échouer, pour la seule scène donnée, les appels des méthodes données. */
export function failFor(
  bench: WebhookBench,
  scene: WebhookScene,
  methods: Record<string, (request: Record<string, unknown>) => unknown>,
): void {
  for (const [method, error] of Object.entries(methods)) {
    bench.spy.hooks.set(method, async (request) => {
      if (touches(request, scene)) throw error(request);
    });
  }
}

/** Seule la branche donnée de la scène échoue (404 « ref » par défaut) sur `listFiles`. */
export function failBranch(
  bench: WebhookBench,
  scene: WebhookScene,
  branch: string,
  error: () => unknown = missingRef,
): void {
  bench.spy.hooks.set("listFiles", async (request) => {
    if (touches(request, scene) && request.ref === branch) throw error();
  });
}

export async function setReconciledAt(
  bench: WebhookBench,
  scene: WebhookScene,
  at: Date | null,
): Promise<void> {
  await bench.query("UPDATE project_repos SET last_reconciled_at = $2 WHERE id = $1", [
    scene.repoId,
    at,
  ]);
}

export async function reconciledAt(bench: WebhookBench, scene: WebhookScene): Promise<Date | null> {
  const [row] = await bench.query<{ last_reconciled_at: Date | null }>(
    "SELECT last_reconciled_at FROM project_repos WHERE id = $1",
    [scene.repoId],
  );
  if (!row) throw new Error(`dépôt ${scene.repoId} absent`);
  return row.last_reconciled_at;
}

export const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000);

/** Audit de tête (`repo.reconcile.*`) de l'organisation de la scène. */
export const headAudit = (bench: WebhookBench, scene: WebhookScene, like = "repo.reconcile.%") =>
  auditOf(bench, scene.organizationId, like);

/** Le dépôt a-t-il été touché par le fournisseur pendant le run ? */
export function callsFor(bench: WebhookBench, scene: WebhookScene, method?: string) {
  return bench.spy.calls.filter(
    (call) => touches(call.request, scene) && (method === undefined || call.method === method),
  );
}

/**
 * Dépôt SANS spec (rôle `front`, pas de `spec_path`) dans la même organisation que la scène :
 * P4 ne doit jamais l'indexer. Il vit dans le faux sous un autre nom.
 */
export async function addCodeRepo(
  bench: WebhookBench,
  scene: WebhookScene,
): Promise<{ repoId: string; name: string }> {
  const name = `code-${randomUUID().slice(0, 8)}`;
  const auth = await bench.spy.auth(scene.owner);
  const created = await bench.spy.inner.createRepo({
    auth,
    owner: scene.owner,
    name,
    visibility: "private",
  });
  const repoId = randomUUID();
  await bench.query(
    `INSERT INTO project_repos (id, organization_id, project_id, installation_id, role, mode, external_id, owner_login, name, default_branch, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'front', 'new', $5, $6, $7, $8, now(), now())`,
    [
      repoId,
      scene.organizationId,
      scene.projectId,
      scene.installationId,
      created.id,
      scene.owner.login,
      name,
      created.defaultBranch,
    ],
  );
  return { repoId, name };
}
