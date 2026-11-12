import type { SpecItem } from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import { SpecDeliverablesService } from "../spec-deliverables/spec-deliverables.service.ts";
import { flowDetail, roleDetail, ruleDetail } from "../spec-read/entity-values.ts";
import { SpecReadService } from "../spec-read/spec-read.service.ts";
import { orNotFound } from "../tracker/api-errors.ts";
import type { ProjectScope } from "../tracker/scope.ts";

/**
 * Lecture d'un élément pour le panneau d'édition (TK-101, B329 b, c) : les valeurs de la fiche lues comme `spec.getFeature`
 * (git au commit indexé), l'état « validé » du livrable Fonctionnel (celui qu'une modification invaliderait) et les éléments
 * de l'index qui citent celui-ci. Lecture seule, aucune entrée d'audit.
 */
@Injectable()
export class SpecItemService {
  constructor(
    @Inject(SpecReadService) private readonly specs: SpecReadService,
    @Inject(SpecDeliverablesService) private readonly deliverables: SpecDeliverablesService,
  ) {}

  async get(
    scope: ProjectScope,
    role: string | undefined,
    type: SpecItem["type"],
    id: string,
  ): Promise<SpecItem> {
    const values = await this.valuesOf(scope, type, id);
    const [referencedBy, listed] = await Promise.all([
      this.specs.referencedBy(scope, id),
      this.deliverables.list(scope, role),
    ]);
    const functional = listed.deliverables.find((entry) => entry.key === "functional");
    return {
      type,
      id,
      values,
      validated: functional?.status === "validated",
      referencedBy,
    } as SpecItem;
  }

  /** Valeurs de la fiche : la fonctionnalité est lue dans git ; règle, rôle et parcours dans l'index d'entités (TK-103). */
  private async valuesOf(scope: ProjectScope, type: SpecItem["type"], id: string) {
    if (type === "feature") return this.specs.getFeature(scope, id);
    if (type === "role") {
      const file = await this.specs.entity(scope, "roles", "roles");
      return orNotFound(
        roleDetail(id, file.data, { filePath: file.path, commitSha: file.commitSha }),
      );
    }
    const entity = await this.specs.entity(scope, type, id);
    const where = { filePath: entity.path, commitSha: entity.commitSha };
    return type === "rule"
      ? ruleDetail(id, entity.data, where)
      : flowDetail(id, entity.data, where);
  }
}
