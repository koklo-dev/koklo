import { contract } from "@koklo/contract";
import { Controller, Inject, Req } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { guard, requestIdFrom } from "../request-context.ts";
import { HealthService } from "./health.service.ts";

@Controller()
export class HealthController {
  constructor(@Inject(HealthService) private readonly service: HealthService) {}

  @Implement(contract.health)
  check(@Req() request: Request) {
    const requestId = requestIdFrom(request.headers["x-request-id"]);
    return implement(contract.health).handler(({ errors }) =>
      guard(requestId, errors, () => this.service.check()),
    );
  }
}
