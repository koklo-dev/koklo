import type {
  ArchflowDetail,
  ArchitectureFlowSummary,
  ArchitectureFlowsByIdInput,
  ArchitectureFlowsListInput,
  ArchitectureLayout,
  ArchitectureLayoutSaved,
  ArchitectureSearch,
  ArchitectureSearchInput,
  ArchitectureSource,
  ArchitectureSourceInput,
  ArchitectureZone,
  ArchitectureZoneInput,
  ArchitectureZones,
} from "@koklo/contract";
import { ARCHITECTURE_SEARCH_MAX } from "@koklo/contract";
import { SCOPING_BRANCH } from "@koklo/domain";
import type { GitReadCache } from "@koklo/github";
import {
  ARCH_LAYOUT_PATH,
  ARCH_ZONES_PATH,
  type ArchLayoutPositions,
  emitArchFlowYaml,
  emitComponentYaml,
  emitFlowMermaid,
  emitSchemaMermaid,
  parseArchLayout,
  parseZones,
  ZONES_PATH,
  type ZoneStyle,
} from "@koklo/schema";
import { Inject, Injectable } from "@nestjs/common";
import { GitAccess } from "../repo/git-access.ts";
import { GIT_PROVIDER, GIT_READ_CACHE, type GitProviderBinding } from "../repo/tokens.ts";
import { SpecBatchService } from "../spec-batch/spec-batch.service.ts";
import { readCommittedFile } from "../spec-data/committed-file.ts";
import { indexFailed } from "../spec-read/index-failed.ts";
import { orNotFound } from "../tracker/api-errors.ts";
import { DEFAULT_PAGE_SIZE } from "../tracker/cursor.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import {
  archFlowOf,
  componentOf,
  flowDetail,
  flowSummary,
  type KnownParticipants,
  knownParticipants,
  type Parcours,
  roleNamesOf,
} from "./architecture-flows.ts";
import {
  archNodes,
  buildArchZone,
  buildArchZones,
  flowParticipants,
} from "./architecture-zones.ts";
import type { GitSource } from "./spec-architecture.repository.ts";
import {
  type DiagramModel,
  type EntityData,
  SPEC_ARCHITECTURE_DIAGRAM_REPOSITORY,
  type SpecArchitectureDiagramRepository,
} from "./spec-architecture-diagram.repository.ts";

type Revision = { branch?: string; commitSha?: string };

const LAYOUT_MESSAGE = "Mise en page du schéma d'architecture";
const SCHEMA_PATH = "architecture/schema.mmd";
const componentPath = (id: string) => `architecture/components/${id.slice(2)}.yaml`;
const flowPath = (id: string, format: "yaml" | "mermaid") =>
  `architecture/flows/${id}.${format === "yaml" ? "yaml" : "mmd"}`;

interface FlowsPageOutput {
  items: ArchitectureFlowSummary[];
  nextCursor: string | null;
  previousCursor: string | null;
  offset: number;
  total: number;
}

/** Page rendue pour une révision non indexée : liste vide. */
const EMPTY_FLOWS: FlowsPageOutput = {
  items: [],
  nextCursor: null,
  previousCursor: null,
  offset: 0,
  total: 0,
};

const parcoursOf = (rows: readonly EntityData[]): Map<string, Parcours> =>
  new Map(rows.map((row) => [row.specId, row.data as Parcours]));

/**
 * Schéma en couches et flux en séquence (TK-112, B541 à B550) : zones, recherche, flux et fiches viennent de l'index
 * d'entités ; seuls `architecture/_layout.yaml`, `architecture/_zones.yaml` et les fichiers dont on rend le texte (YAML,
 * Mermaid) sont lus chez le fournisseur au commit indexé, hors transaction. La mise en page s'écrit par un lot du worker.
 */
@Injectable()
export class SpecArchitectureDiagramService {
  constructor(
    @Inject(SPEC_ARCHITECTURE_DIAGRAM_REPOSITORY)
    private readonly repository: SpecArchitectureDiagramRepository,
    @Inject(GIT_PROVIDER) private readonly provider: GitProviderBinding,
    @Inject(GitAccess) private readonly access: GitAccess,
    @Inject(GIT_READ_CACHE) private readonly cache: GitReadCache,
    @Inject(SpecBatchService) private readonly batches: SpecBatchService,
  ) {}

  /** Zones : une carte par zone, comptes, aperçu, liens et acteurs calculés sur toute la tête (B546). */
  async zones(scope: ProjectScope, input: Revision): Promise<ArchitectureZones> {
    const { model, styles } = await this.zoneModel(scope, input);
    return {
      ...buildArchZones(archNodes(model.components), flowParticipants(model.flows), styles),
      commitSha: model.commitSha,
    };
  }

  /** Une zone ouverte : ses composants (200 au plus), dépendances, acteurs et liens sortants ; zone inconnue : 404. */
  async zone(scope: ProjectScope, input: ArchitectureZoneInput): Promise<ArchitectureZone> {
    const { zone, ...revision } = input;
    const { model, styles } = await this.zoneModel(scope, revision);
    const view = orNotFound(
      buildArchZone(
        archNodes(model.components),
        flowParticipants(model.flows),
        styles,
        zone,
        roleNamesOf(model.roles),
      ),
    );
    return {
      zone: view.zone,
      components: view.members.map(({ id, name, type, responsibility }) => ({
        specId: id,
        name,
        type,
        responsibility,
      })),
      relations: view.relations,
      crossRelations: view.crossRelations,
      actors: view.actors,
      actorRelations: view.actorRelations,
      outgoing: view.outgoing,
      truncated: view.truncated,
      commitSha: model.commitSha,
    };
  }

  /** Recherche d'un composant par nom ou identifiant parmi tous ceux de la tête, 20 au plus (B546). */
  async search(scope: ProjectScope, input: ArchitectureSearchInput): Promise<ArchitectureSearch> {
    const { q, ...revision } = input;
    const indexed = await this.repository.searchComponents(
      scope,
      revision,
      q,
      ARCHITECTURE_SEARCH_MAX,
    );
    if (indexed?.kind === "failed") throw indexFailed(indexed);
    return {
      items: archNodes(indexed?.rows ?? []).map(({ id, name, type, zone }) => ({
        specId: id,
        name,
        type,
        ...(zone === undefined ? {} : { zone }),
      })),
    };
  }

  /** Positions du schéma : `architecture/_layout.yaml` au commit de tête ; absent ou illisible : aucune position. */
  async layout(scope: ProjectScope, input: Revision): Promise<ArchitectureLayout> {
    const source = await this.repository.headSource(scope, input);
    if (source?.kind === "failed") throw indexFailed(source);
    const found = orNotFound(source);
    const text = await this.readCommitted(found, ARCH_LAYOUT_PATH);
    const parsed = text === undefined ? undefined : parseArchLayout(text);
    return { positions: parsed?.ok ? parsed.positions : {}, commitSha: found.commitSha };
  }

  /**
   * Enregistre les positions : un lot d'une opération `architecture.layout.save` sur `cadrage`, sans `baseSha` (le dernier
   * écrit gagne, B542). Le worker écrit le fichier ; le lot est audité comme tout lot de spec.
   */
  async saveLayout(
    scope: ProjectScope,
    role: string,
    input: { idempotencyKey: string; positions: ArchLayoutPositions },
  ): Promise<ArchitectureLayoutSaved> {
    const batch = await this.batches.commitPrepared(scope, role, () => ({
      idempotencyKey: input.idempotencyKey,
      branch: SCOPING_BRANCH,
      baseSha: null,
      message: LAYOUT_MESSAGE,
      operations: [
        {
          kind: "architecture.layout.save",
          specId: null,
          payload: { positions: input.positions },
        },
      ],
    }));
    return { commitSha: batch.commitSha };
  }

  /** Liste des flux : pages de 50, `q` sur toute la tête (titre du parcours compris), `around` amène un flux (B543). */
  async flows(scope: ProjectScope, input: ArchitectureFlowsListInput): Promise<FlowsPageOutput> {
    const { branch, commitSha, q, cursor, around, limit } = input;
    const indexed = await this.repository.flowsPage(
      scope,
      { branch, commitSha },
      { q, cursor, around, limit: limit ?? DEFAULT_PAGE_SIZE },
    );
    if (indexed?.kind === "failed") throw indexFailed(indexed);
    if (indexed === null) return EMPTY_FLOWS;
    const { items, parcours, components, roles, ...position } = indexed.page;
    const known = knownParticipants(components, roles);
    const titles = parcoursOf(parcours);
    return {
      ...position,
      items: items.map((row) => flowSummary(row.specId, row.data, titles.get(row.specId), known)),
    };
  }

  /** Détail d'un flux ; flux inconnu : 404. Rendu aussi par `spec.item.get` (type `archflow`, B545). */
  async flow(
    scope: ProjectScope,
    input: Omit<ArchitectureFlowsByIdInput, "projectId">,
  ): Promise<ArchflowDetail> {
    const { flowId, ...revision } = input;
    const found = await this.flowFound(scope, revision, flowId);
    return flowDetail(
      flowId,
      found.flow.data,
      found.parcours?.data as Parcours | undefined,
      knownParticipants(found.components, found.roles),
      { filePath: found.flow.path, commitSha: found.commitSha },
    );
  }

  /**
   * Texte d'un composant (YAML), d'un flux (YAML ou Mermaid) ou du schéma (Mermaid) : le fichier du dépôt au commit indexé,
   * sinon produit depuis l'index (`generated`). Équipe seulement : le contrôleur refuse client et business.
   */
  async source(scope: ProjectScope, input: ArchitectureSourceInput): Promise<ArchitectureSource> {
    const { target, format, projectId: _projectId, ...revision } = input;
    if (target.kind === "component") return this.componentSource(scope, revision, target.id ?? "");
    if (target.kind === "flow") {
      return this.flowSource(scope, revision, target.id ?? "", format ?? "yaml");
    }
    return this.schemaSource(scope, revision);
  }

  private async componentSource(
    scope: ProjectScope,
    revision: Revision,
    id: string,
  ): Promise<ArchitectureSource> {
    const indexed = await this.repository.component(scope, revision, id);
    if (indexed?.kind === "failed") throw indexFailed(indexed);
    const found = orNotFound(indexed);
    const path = found.component.path || componentPath(id);
    const committed = await this.readCommitted(found, path);
    if (committed !== undefined) {
      return { path, text: committed, commitSha: found.commitSha, generated: false };
    }
    const component = orNotFound(componentOf(found.component.data));
    return {
      path,
      text: emitComponentYaml(component),
      commitSha: found.commitSha,
      generated: true,
    };
  }

  private async flowSource(
    scope: ProjectScope,
    revision: Revision,
    id: string,
    format: "yaml" | "mermaid",
  ): Promise<ArchitectureSource> {
    const found = await this.flowFound(scope, revision, id);
    const path = format === "yaml" ? found.flow.path || flowPath(id, "yaml") : flowPath(id, format);
    const committed = await this.readCommitted(found, path);
    if (committed !== undefined) {
      return { path, text: committed, commitSha: found.commitSha, generated: false };
    }
    const flow = orNotFound(archFlowOf(found.flow.data));
    const text =
      format === "yaml"
        ? emitArchFlowYaml(flow)
        : emitFlowMermaid(flow, this.labelsOf(knownParticipants(found.components, found.roles)));
    return { path, text, commitSha: found.commitSha, generated: true };
  }

  private async schemaSource(scope: ProjectScope, revision: Revision): Promise<ArchitectureSource> {
    const model = await this.model(scope, revision);
    const committed = await this.readCommitted(model, SCHEMA_PATH);
    if (committed !== undefined) {
      return { path: SCHEMA_PATH, text: committed, commitSha: model.commitSha, generated: false };
    }
    const components = model.components.flatMap((row) => componentOf(row.data) ?? []);
    return {
      path: SCHEMA_PATH,
      text: emitSchemaMermaid(components),
      commitSha: model.commitSha,
      generated: true,
    };
  }

  /** Nom lisible de chaque participant (composant ou acteur) pour les en-têtes du Mermaid. */
  private labelsOf(known: KnownParticipants): Record<string, string> {
    return Object.fromEntries([
      ...[...known.components].map(([id, { name }]) => [id, name]),
      ...known.roles,
    ]);
  }

  private async flowFound(scope: ProjectScope, revision: Revision, flowId: string) {
    const indexed = await this.repository.flow(scope, revision, flowId);
    if (indexed?.kind === "failed") throw indexFailed(indexed);
    return orNotFound(indexed);
  }

  private async model(scope: ProjectScope, revision: Revision): Promise<DiagramModel> {
    const indexed = await this.repository.model(scope, revision);
    if (indexed?.kind === "failed") throw indexFailed(indexed);
    return orNotFound(indexed);
  }

  /**
   * Libellés et icônes des zones : `architecture/_zones.yaml` au commit lu, puis `data/_zones.yaml` (B513) ; absent,
   * illisible ou fournisseur injoignable : aucun style (icône par défaut), un décor ne casse pas la vue.
   */
  private async zoneModel(scope: ProjectScope, revision: Revision) {
    const model = await this.model(scope, revision);
    const styles = [
      ...(await this.zoneStyles(model, ARCH_ZONES_PATH)),
      ...(await this.zoneStyles(model, ZONES_PATH)),
    ];
    return { model, styles };
  }

  private async zoneStyles(source: GitSource, file: string): Promise<ZoneStyle[]> {
    try {
      const text = await this.readCommitted(source, file);
      const parsed = text === undefined ? undefined : parseZones(text);
      return parsed?.ok ? parsed.zones : [];
    } catch {
      return [];
    }
  }

  private readCommitted(source: GitSource, file: string): Promise<string | undefined> {
    return readCommittedFile(this.provider, this.access, this.cache, source, file);
  }
}
