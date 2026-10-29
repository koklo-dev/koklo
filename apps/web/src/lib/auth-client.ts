import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/** Même origine que l'application : `/api/auth/*` est relayé vers l'API par le proxy. */
export const authClient = createAuthClient({ plugins: [organizationClient()] });
