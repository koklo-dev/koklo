import { contract } from "@koklo/contract";
import { createORPCClient } from "@orpc/client";
import type { RouterContractClient } from "@orpc/contract";
import type { JsonifiedClient } from "@orpc/openapi";
import { OpenAPILink } from "@orpc/openapi/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { ORPC_PREFIX } from "./orpc-prefix.ts";

const link = new OpenAPILink(contract, {
  url: ORPC_PREFIX,
  origin: () => window.location.origin,
});

const client: JsonifiedClient<RouterContractClient<typeof contract>> = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
