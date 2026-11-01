/** Transport HTTP injectable : `fetch` en production, `SimulatedAnthropicTransport.fetch` en test. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
