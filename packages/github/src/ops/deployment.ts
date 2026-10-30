import type { Deployment } from "@koklo/domain";
import type { Gateway } from "../gateway.ts";
import { type ApiDeployment, type ApiDeploymentStatus, toDeployment } from "../mappers.ts";
import { collectPages, PAGE_SIZE } from "../pagination.ts";
import { type Request, repoId, target } from "./shared.ts";

/**
 * Liste complète des déploiements d'une référence : pagination interne bornée, puis dernier
 * statut de chacun (`per_page=1`, le plus récent d'abord). Sans statut : `pending`.
 */
export function listDeployments(
  gw: Gateway,
  request: Request<"listDeployments">,
): Promise<readonly Deployment[]> {
  const { auth, repo, ref } = request;
  const operation = {
    operation: "listDeployments",
    resource: "deployments",
    identifier: `${repoId(repo)}@${ref}`,
  };
  return gw.withAuth(operation, auth, async (octokit) => {
    const pages = octokit.paginate.iterator(octokit.rest.repos.listDeployments, {
      ...target(repo),
      ref,
      per_page: PAGE_SIZE,
    });
    const raw = await collectPages<ApiDeployment>(pages, "listDeployments", gw.maxPages);
    const deployments: Deployment[] = [];
    for (const item of raw) {
      const statuses = await octokit.rest.repos.listDeploymentStatuses({
        ...target(repo),
        deployment_id: Number(item.id),
        per_page: 1,
      });
      deployments.push(toDeployment(item, (statuses.data as ApiDeploymentStatus[])[0]));
    }
    return deployments;
  });
}
