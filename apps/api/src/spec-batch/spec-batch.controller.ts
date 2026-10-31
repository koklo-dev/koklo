import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { SPEC_BATCH_ROLES } from "../auth/roles.ts";
import { RoleGuard, Roles, requireSession, SessionGuard } from "../auth/session.guard.ts";
import { inProject } from "../tracker/scope.ts";
import { SpecBatchService } from "./spec-batch.service.ts";

/** Écriture et lecture des lots : `SPEC_BATCH_ROLES` (le designer est limité par opération, dans le worker). */
@Controller()
export class SpecBatchController {
  constructor(@Inject(SpecBatchService) private readonly service: SpecBatchService) {}

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.specBatch.submit)
  submit(@Req() request: Request) {
    return implement(contract.specBatch.submit).handler(({ input, errors }) =>
      inProject(request, errors, input.projectId, (scope) =>
        this.service.submit(scope, requireSession(request).role ?? "", input),
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.specBatch.get)
  get(@Req() request: Request) {
    return implement(contract.specBatch.get).handler(({ input, errors }) =>
      inProject(request, errors, input.projectId, (scope) =>
        this.service.get(scope, input.batchId),
      ),
    );
  }
}
