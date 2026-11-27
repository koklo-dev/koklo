import type { SpecItem } from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import { componentDetail } from "../spec-architecture/architecture-values.ts";
import { SpecArchitectureService } from "../spec-architecture/spec-architecture.service.ts";
import { SpecArchitectureDiagramService } from "../spec-architecture/spec-architecture-diagram.service.ts";
import { tableDetail } from "../spec-data/data-values.ts";
import { SpecDeliverablesService } from "../spec-deliverables/spec-deliverables.service.ts";
import { flowDetail, roleDetail, ruleDetail } from "../spec-read/entity-values.ts";
import { SpecReadService } from "../spec-read/spec-read.service.ts";
import { SpecTechnicalService } from "../spec-technical/spec-technical.service.ts";
import { orNotFound } from "../tracker/api-errors.ts";
import type { ProjectScope } from "../tracker/scope.ts";

const ARCHITECTURE_TYPES: readonly SpecItem["type"][] = ["component", "archflow", "adr"];

/**
 * Livrable que modifier l'élément invaliderait : Données pour une table, Architecture pour un composant, un flux ou une
 * décision, Technique pour un choix ou un environnement, Fonctionnel pour le reste.
 */
const deliverableOf = (type: SpecItem["type"]) => {
  if (type === "table") return "data";
  if (type === "stack" || type === "environment") return "technical";
  return ARCHITECTURE_TYPES.includes(type) ? "architecture" : "functional";
};

/**
 * Lecture d'un élément pour le panneau d'édition (TK-101, B329 b, c) : les valeurs de la fiche lues comme `spec.getFeature`
 * (git au commit indexé), l'état « validé » du livrable concerné (celui qu'une modification invaliderait : Données pour une table) et les éléments
 * de l'index qui citent celui-ci. Lecture seule, aucune entrée d'audit.
 */
@Injectable()
export class SpecItemService {
  constructor(
    @Inject(SpecReadService) private readonly specs: SpecReadService,
    @Inject(SpecDeliverablesService) private readonly deliverables: SpecDeliverablesService,
    @Inject(SpecArchitectureDiagramService)
    private readonly architecture: SpecArchitectureDiagramService,
    @Inject(SpecArchitectureService) private readonly adrs: SpecArchitectureService,
    @Inject(SpecTechnicalService) private readonly technical: SpecTechnicalService,
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
    const deliverable = listed.deliverables.find((entry) => entry.key === deliverableOf(type));
    return {
      type,
      id,
      values,
      validated: deliverable?.status === "validated",
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
    if (type === "stack") return this.technical.stack(scope, id);
    if (type === "environment") return this.technical.environment(scope, id);
    if (type === "archflow") return this.architecture.flow(scope, { flowId: id });
    if (type === "adr") return this.adrs.adr(scope, { adrId: id });
    const entity = await this.specs.entity(scope, type, id);
    const where = { filePath: entity.path, commitSha: entity.commitSha };
    if (type === "table") return tableDetail(id, entity.data, where);
    if (type === "component") return componentDetail(id, entity.data, where);
    return type === "rule"
      ? ruleDetail(id, entity.data, where)
      : flowDetail(id, entity.data, where);
  }
}
