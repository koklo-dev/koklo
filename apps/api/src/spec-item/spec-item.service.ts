import type { SpecItem } from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import { SpecDeliverablesService } from "../spec-deliverables/spec-deliverables.service.ts";
import { SpecReadService } from "../spec-read/spec-read.service.ts";
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

  async get(scope: ProjectScope, role: string | undefined, id: string): Promise<SpecItem> {
    const values = await this.specs.getFeature(scope, id);
    const [referencedBy, listed] = await Promise.all([
      this.specs.referencedBy(scope, id),
      this.deliverables.list(scope, role),
    ]);
    const functional = listed.deliverables.find((entry) => entry.key === "functional");
    return {
      type: "feature",
      id,
      values,
      validated: functional?.status === "validated",
      referencedBy,
    };
  }
}
