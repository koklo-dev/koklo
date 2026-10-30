import type { Dependency, TicketPackage, TicketPriority, TicketType } from "@koklo/domain";
import type { ProjectScope } from "../tracker/scope.ts";

export const TICKET_REPOSITORY = Symbol("TICKET_REPOSITORY");

export type TicketStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "in_review"
  | "blocked"
  | "done"
  | "cancelled";
export type Holder = { kind: "member" | "runner"; id: string };

/** Ticket lu en base (non supprimé), tel que le service le manipule. */
export interface TicketRecord {
  id: string;
  key: string;
  title: string;
  description: string;
  type: TicketType;
  status: TicketStatus;
  priority: TicketPriority;
  sprintKey: string | null;
  assignee: Holder | null;
  pkg: TicketPackage;
  labels: string[];
  sensitivity: "safe" | "sensitive";
  estimateHours: number | null;
  linkedFeatures: string[];
  branch: string | null;
  pullRequest: string | null;
  attempts: number;
  reviewRounds: number;
  createdAt: Date;
}

export interface Criterion {
  statement: string;
  specRef: string | null;
}

export interface LeaseRecord {
  holder: Holder;
  branch: string;
  worktree: string;
  acquiredAt: Date;
  heartbeatAt: Date;
  expiresAt: Date;
  ttlMs: number;
  released: boolean;
}

/** Champs d'un ticket à écrire ; le statut n'y figure qu'à la création (backlog ou todo). */
export interface TicketFields {
  title: string;
  description: string;
  type: TicketType;
  priority: TicketPriority;
  pkg: TicketPackage;
  sensitivity: "safe" | "sensitive";
  estimateHours: number | null;
  assignee: Holder | null;
  labels: string[];
  linkedFeatures: string[];
}

export interface NewTicket extends TicketFields {
  key: string;
  status: "backlog" | "todo";
  sprintId: string | null;
  criteria: Criterion[];
}

export type TicketChanges = Partial<TicketFields> & { sprintId?: string };

export interface SprintRef {
  id: string;
  key: string;
  status: "planned" | "active" | "closed";
}

export interface TicketFilter {
  status?: TicketStatus;
  sprintKey?: string;
  pkg?: TicketPackage;
  assignee?: string;
}

export interface TicketPage {
  items: TicketRecord[];
  nextCursor: string | null;
}

/** Opérations d'une transaction de projet : toutes bornées à l'organisation et au projet de la portée. */
export interface TicketStore {
  /** Numéro suivant du compteur de tickets du projet. */
  nextNumber(): Promise<number>;
  findSprint(key: string): Promise<SprintRef | null>;
  /** Ticket non supprimé du projet. */
  find(key: string): Promise<TicketRecord | null>;
  list(filter: TicketFilter, limit: number, cursor?: string): Promise<TicketPage>;
  insert(ticket: NewTicket): Promise<TicketRecord>;
  update(id: string, changes: TicketChanges): Promise<TicketRecord>;
  setStatus(id: string, status: TicketStatus): Promise<TicketRecord>;
  softDelete(id: string): Promise<void>;
  hasActiveLease(id: string): Promise<boolean>;
  activeLease(id: string): Promise<LeaseRecord | null>;
  criteria(id: string): Promise<Criterion[]>;
  /** Arêtes sortantes du ticket vers des tickets non supprimés, avec ces tickets. */
  dependenciesOf(id: string): Promise<{ edges: Dependency[]; targets: TicketRecord[] }>;
  /** Toutes les arêtes entre tickets non supprimés du projet (entrée de la détection de cycle). */
  projectEdges(): Promise<Dependency[]>;
  addEdge(ticketId: string, dependsOnId: string, type: Dependency["type"]): Promise<void>;
  /** `false` si l'arête n'existait pas. */
  removeEdge(ticketId: string, dependsOnId: string, type: Dependency["type"]): Promise<boolean>;
  audit(action: string, ticketId: string): Promise<void>;
}

/** Port des tickets : `work` s'exécute dans une seule transaction (écriture et audit ensemble). */
export interface TicketRepository {
  run<T>(scope: ProjectScope, work: (store: TicketStore) => Promise<T>): Promise<T>;
}
