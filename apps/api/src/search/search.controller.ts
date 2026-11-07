import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { requireSession, SessionGuard } from "../auth/session.guard.ts";
import { PROJECT_ACCESS, type ProjectAccess } from "../project/project-access.ts";
import { guard, requestIdOf } from "../request-context.ts";
import { SearchService } from "./search.service.ts";

/** Palette ⌘K (TK-88) : ouverte à tout rôle, chaque section revérifie l'accès côté serveur. */
@Controller()
export class SearchController {
  constructor(
    @Inject(SearchService) private readonly service: SearchService,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccess,
  ) {}

  @UseGuards(SessionGuard)
  @Implement(contract.search.query)
  query(@Req() request: Request) {
    const requestId = requestIdOf(request);
    return implement(contract.search.query).handler(({ input, errors }) =>
      guard(requestId, errors, () =>
        this.service.query(requireSession(request), this.access, input),
      ),
    );
  }
}
