/**
 * Aucun appel réseau en CI (TK-54) : tout `fetch` global non simulé échoue bruyamment. L'adaptateur
 * reçoit son transport simulé par injection ; un appel qui contournerait l'injection est détecté ici.
 */
globalThis.fetch = (() => {
  throw new Error("fetch global interdit en test : injecter un transport simulé");
}) as typeof fetch;
