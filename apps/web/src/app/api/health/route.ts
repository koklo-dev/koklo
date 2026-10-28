/** Sonde de vivacité : ne dépend ni de l'API ni de la base, pour qu'un orchestrateur teste le seul process web. */
export function GET(): Response {
  return Response.json({ status: "ok" });
}
