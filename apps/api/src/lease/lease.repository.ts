import type { LeaseRecord } from "../ticket/ticket.repository.ts";
import type { ProjectScope } from "../tracker/scope.ts";

export const LEASE_REPOSITORY = Symbol("LEASE_REPOSITORY");

/** Ticket non supprimé du projet courant, seule porte d'accès aux baux (isolation entre projets). */
export interface LeaseTicket {
  id: string;
  key: string;
}

export interface NewLease {
  ticketId: string;
  holder: LeaseRecord["holder"];
  branch: string;
  worktree: string;
  acquiredAt: Date;
  heartbeatAt: Date;
  expiresAt: Date;
  ttlMs: number;
}

/** Opérations d'une transaction de bail ; `now` est toujours l'instant de l'horloge injectée. */
export interface LeaseStore {
  findTicket(key: string): Promise<LeaseTicket | null>;
  /** Bail non libéré et non expiré à `now`. */
  activeLease(ticketId: string, now: Date): Promise<LeaseRecord | null>;
  /** Dernier bail pris sur le ticket, actif ou non. */
  latestLease(ticketId: string): Promise<LeaseRecord | null>;
  /** Marque libérés les baux expirés du ticket : l'index unique partiel ignore `expires_at`. */
  releaseExpired(ticketId: string, now: Date): Promise<void>;
  insert(lease: NewLease): Promise<LeaseRecord>;
  /** Prolonge le bail s'il est encore actif ; `false` si la course a été perdue. */
  extend(id: string, heartbeatAt: Date, expiresAt: Date): Promise<boolean>;
  /** Libère le bail s'il n'est pas déjà libéré ; `false` si la course a été perdue. */
  markReleased(id: string, releasedAt: Date): Promise<boolean>;
  audit(action: string, lease: LeaseRecord, ticketId: string): Promise<void>;
}

export interface LeaseRepository {
  run<T>(scope: ProjectScope, work: (store: LeaseStore) => Promise<T>): Promise<T>;
}
