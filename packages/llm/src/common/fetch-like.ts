/** Transport HTTP injectable : `fetch` en production, un transport simulé en test. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
