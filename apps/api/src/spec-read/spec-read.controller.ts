import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { SessionGuard } from "../auth/session.guard.ts";
import { inProject } from "../tracker/scope.ts";
import { SpecReadService } from "./spec-read.service.ts";

/** Lectures ouvertes à tous les rôles du projet (CDC §8.2) : l'appartenance est vérifiée par la première lecture. */
@Controller()
export class SpecReadController {
  constructor(@Inject(SpecReadService) private readonly service: SpecReadService) {}

  @UseGuards(SessionGuard)
  @Implement(contract.spec.head)
  head(@Req() request: Request) {
    return implement(contract.spec.head).handler(({ input, errors }) =>
      inProject(request, errors, input.projectId, (scope) =>
        this.service.head(scope, { branch: input.branch, commitSha: input.commitSha }),
      ),
    );
  }

  @UseGuards(SessionGuard)
  @Implement(contract.spec.listFeatures)
  listFeatures(@Req() request: Request) {
    return implement(contract.spec.listFeatures).handler(({ input, errors }) =>
      inProject(request, errors, input.projectId, (scope) =>
        this.service.listFeatures(scope, input),
      ),
    );
  }

  @UseGuards(SessionGuard)
  @Implement(contract.spec.getFeature)
  getFeature(@Req() request: Request) {
    return implement(contract.spec.getFeature).handler(({ input, errors }) =>
      inProject(request, errors, input.projectId, (scope) =>
        this.service.getFeature(scope, input.specId),
      ),
    );
  }
}
