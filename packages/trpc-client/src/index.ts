/**
 * `@koklo/trpc-client` — the desktop IPC contract and its typed Tauri invoke client.
 *
 * - `contract.ts` (US-013): contract types + command/event name registry.
 * - `client.ts`   (US-014): `createKokloClient()` — typed `invoke` dispatcher +
 *   transcript event subscription layer.
 */
export * from "./contract.js";
export * from "./client.js";

/** Package identifier (kept for back-compat with the P1 scaffold). */
export const trpcClientPackage = "@koklo/trpc-client";
