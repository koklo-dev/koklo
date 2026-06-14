/**
 * The live Koklo IPC client for the desktop app. `createKokloClient()` defaults
 * to the real `@tauri-apps/api` transport; screens receive the client by prop so
 * tests can inject a mock without a running Tauri runtime.
 */
import { createKokloClient, type KokloClient } from "@koklo/trpc-client";

export const kokloClient: KokloClient = createKokloClient();
