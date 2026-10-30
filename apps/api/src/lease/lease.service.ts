import type { LeaseAcquireInput } from "@koklo/contract";
import {
  acquireLease,
  type Holder,
  heartbeat,
  type Lease,
  LeaseExpiredError,
  release,
} from "@koklo/domain";
import { Inject, Injectable } from "@nestjs/common";
import { canSeeWorktree } from "../auth/roles.ts";
import { CLOCK, type Clock } from "../clock.ts";
import { leaseOutput } from "../ticket/ticket-output.ts";
import {
  isUniqueViolation,
  notFound,
  orNotFound,
  toApiError,
  viaDomain,
} from "../tracker/api-errors.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import {
  LEASE_REPOSITORY,
  type LeaseRepository,
  type LeaseStore,
  type LeaseTicket,
} from "./lease.repository.ts";
import { heldError, toDomainLease } from "./lease-domain.ts";

const holderOf = (scope: ProjectScope): Holder => ({ kind: "member", id: scope.userId });

const requireTicket = async (store: LeaseStore, key: string): Promise<LeaseTicket> =>
  orNotFound(await store.findTicket(key));

/** Baux de livraison : le domaine décide (titulaire, expiration), l'API orchestre et persiste. */
@Injectable()
export class LeaseService {
  constructor(
    @Inject(LEASE_REPOSITORY) private readonly repository: LeaseRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Prise d'un bail. Les baux expirés du ticket sont marqués libérés dans la même transaction,
   * avant l'INSERT (l'index unique partiel ignore `expires_at`). Une course perdue sur cet index
   * (P2002) annule la transaction : le titulaire gagnant est relu dans une seconde.
   */
  async acquire(scope: ProjectScope, input: LeaseAcquireInput): Promise<Lease> {
    const now = this.clock.now();
    try {
      return await this.repository.run(scope, (store) => this.acquireIn(store, scope, input, now));
    } catch (error) {
      throw await this.lostRace(error, scope, input.key, now);
    }
  }

  heartbeat(scope: ProjectScope, key: string): Promise<Lease> {
    const now = this.clock.now();
    return this.repository.run(scope, async (store) => {
      const ticket = await requireTicket(store, key);
      const active = await store.activeLease(ticket.id, new Date(now));
      if (!active) {
        throw await this.inactive(store, ticket);
      }
      const lease = viaDomain(() => heartbeat(toDomainLease(key, active), holderOf(scope), now));
      const extended = await store.extend(
        active.id,
        new Date(lease.heartbeatAt),
        new Date(lease.expiresAt),
      );
      if (!extended) {
        throw toApiError(new LeaseExpiredError(toDomainLease(key, active)));
      }
      await store.audit("lease.heartbeat", active, ticket.id);
      return lease;
    });
  }

  release(scope: ProjectScope, key: string): Promise<Lease> {
    const now = this.clock.now();
    return this.repository.run(scope, async (store) => {
      const ticket = await requireTicket(store, key);
      const active = orNotFound(await store.activeLease(ticket.id, new Date(now)));
      const lease = viaDomain(() => release(toDomainLease(key, active), holderOf(scope)));
      if (!(await store.markReleased(active.id, new Date(now)))) {
        throw notFound();
      }
      await store.audit("lease.release", active, ticket.id);
      return lease;
    });
  }

  get(scope: ProjectScope, key: string, role: string | undefined) {
    const now = this.clock.now();
    return this.repository.run(scope, async (store) => {
      const ticket = await requireTicket(store, key);
      const active = await store.activeLease(ticket.id, new Date(now));
      return active && leaseOutput(key, active, canSeeWorktree(role));
    });
  }

  private async acquireIn(
    store: LeaseStore,
    scope: ProjectScope,
    input: LeaseAcquireInput,
    now: string,
  ): Promise<Lease> {
    const ticket = await requireTicket(store, input.key);
    await store.releaseExpired(ticket.id, new Date(now));
    const active = await store.activeLease(ticket.id, new Date(now));
    const { lease } = viaDomain(() =>
      acquireLease(
        active ? [toDomainLease(input.key, active)] : [],
        {
          ticket: input.key,
          holder: holderOf(scope),
          branch: input.branch,
          worktree: input.worktree,
          ttlMs: input.ttlMs,
        },
        now,
      ),
    );
    const record = await store.insert({
      ticketId: ticket.id,
      holder: lease.holder,
      branch: lease.branch,
      worktree: lease.worktree,
      acquiredAt: new Date(lease.acquiredAt),
      heartbeatAt: new Date(lease.heartbeatAt),
      expiresAt: new Date(lease.expiresAt),
      ttlMs: lease.ttlMs,
    });
    await store.audit("lease.acquire", record, ticket.id);
    return lease;
  }

  /** Perte de la course sur l'index partiel : `LEASE_HELD` portant le gagnant, jamais `INTERNAL`. */
  private async lostRace(error: unknown, scope: ProjectScope, key: string, now: string) {
    if (!isUniqueViolation(error)) {
      return error;
    }
    const winner = await this.repository.run(scope, async (store) => {
      const ticket = await requireTicket(store, key);
      return store.activeLease(ticket.id, new Date(now));
    });
    return winner ? toApiError(heldError(key, winner)) : error;
  }

  /** Aucun bail actif : `LEASE_EXPIRED` si le ticket en a eu un, sinon `NOT_FOUND`. */
  private async inactive(store: LeaseStore, ticket: LeaseTicket): Promise<unknown> {
    const latest = await store.latestLease(ticket.id);
    return latest
      ? toApiError(new LeaseExpiredError(toDomainLease(ticket.key, latest)))
      : notFound();
  }
}
