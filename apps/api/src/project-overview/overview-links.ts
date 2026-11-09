/** Adresses de l'application que la vue d'ensemble propose (chemins relatifs, construits côté serveur). */
export const AI_SETTINGS_PATH = "/settings/ai";
export const ideaLink = (projectId: string): string => `/projects/${projectId}/idea`;
export const specLink = (projectId: string, deliverable = "functional"): string =>
  `/projects/${projectId}/spec/${deliverable}`;
export const ticketsLink = (projectId: string): string => `/projects/${projectId}/tickets`;
