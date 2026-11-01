import type { LlmProviderId } from "@koklo/domain";
import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.module.ts";
import type {
  LlmCredentialRepository,
  LlmCredentialStatus,
  StoredLlmCredential,
  UpsertLlmCredential,
} from "./llm-credential.repository.ts";

/** Squelette du Red (TK-52a) : le Green l'implémente. */
@Injectable()
export class PrismaLlmCredentialRepository implements LlmCredentialRepository {
  constructor(@Inject(DatabaseService) protected readonly database: DatabaseService) {}

  upsert(_organizationId: string, _input: UpsertLlmCredential): Promise<LlmCredentialStatus> {
    return Promise.reject(new Error("not implemented"));
  }
  list(_organizationId: string): Promise<LlmCredentialStatus[]> {
    return Promise.reject(new Error("not implemented"));
  }
  find(_organizationId: string, _provider: LlmProviderId): Promise<StoredLlmCredential | null> {
    return Promise.reject(new Error("not implemented"));
  }
  remove(_organizationId: string, _provider: LlmProviderId): Promise<boolean> {
    return Promise.reject(new Error("not implemented"));
  }
  invalidate(
    _organizationId: string,
    _provider: LlmProviderId,
    _at: string,
  ): Promise<LlmCredentialStatus | null> {
    return Promise.reject(new Error("not implemented"));
  }
  markUsed(_organizationId: string, _provider: LlmProviderId, _at: string): Promise<void> {
    return Promise.reject(new Error("not implemented"));
  }
}
