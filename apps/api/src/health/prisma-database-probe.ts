import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.module.ts";
import type { DatabaseProbe } from "./database-probe.ts";

/** Interroge le pool réellement utilisé par l'application. */
@Injectable()
export class PrismaDatabaseProbe implements DatabaseProbe {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async ping(): Promise<void> {
    await this.database.raw.$queryRaw`SELECT 1`;
  }
}
