import { generateOpenApi } from "@koklo/contract";
import { Controller, Get } from "@nestjs/common";

/** Document OpenAPI du contrat : public, sans donnée métier. */
@Controller()
export class OpenApiController {
  private document: Promise<Record<string, unknown>> | undefined;

  @Get("openapi.json")
  get(): Promise<Record<string, unknown>> {
    this.document ??= generateOpenApi();
    return this.document;
  }
}
