import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { requireSession, SessionGuard } from "../auth/session.guard.ts";
import { guard, requestIdOf } from "../request-context.ts";
import { MeService } from "./me.service.ts";

/** Mon compte : toute session avec organisation, client compris ; l'utilisateur vient de la session, jamais de l'entrée. */
@Controller()
@UseGuards(SessionGuard)
export class MeController {
  constructor(@Inject(MeService) private readonly service: MeService) {}

  @Implement(contract.me.get)
  get(@Req() request: Request) {
    const requestId = requestIdOf(request);
    return implement(contract.me.get).handler(({ errors }) =>
      guard(requestId, errors, () => this.service.get(requireSession(request))),
    );
  }

  @Implement(contract.me.update)
  update(@Req() request: Request) {
    const requestId = requestIdOf(request);
    return implement(contract.me.update).handler(({ input, errors }) =>
      guard(requestId, errors, () => this.service.update(requireSession(request), input.name)),
    );
  }

  @Implement(contract.me.getNotifications)
  getNotifications(@Req() request: Request) {
    const requestId = requestIdOf(request);
    return implement(contract.me.getNotifications).handler(({ errors }) =>
      guard(requestId, errors, () => this.service.notifications(requireSession(request))),
    );
  }

  @Implement(contract.me.updateNotification)
  updateNotification(@Req() request: Request) {
    const requestId = requestIdOf(request);
    return implement(contract.me.updateNotification).handler(({ input, errors }) =>
      guard(requestId, errors, () =>
        this.service.setNotification(requireSession(request), input.key, input.enabled),
      ),
    );
  }
}
