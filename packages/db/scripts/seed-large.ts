import { SEED_VOLUME_IDS, seedLarge } from "../src/seed-volume.ts";
import { PENDING_VOLUMES } from "../src/seed-volumes.ts";
import { loadDatabaseUrl } from "./load-database-url.ts";

seedLarge(loadDatabaseUrl())
  .then((volume) => {
    console.log(
      `Jeu de charge appliqué au projet « ${SEED_VOLUME_IDS.large.name} » : ${volume.features} fonctionnalités, ${volume.tables} tables, ${volume.endpoints} points d'accès, ${volume.tickets} tickets, ${volume.proposals} propositions de l'agent.`,
    );
    const pending = Object.entries(PENDING_VOLUMES.large)
      .map(([type, declared]) => `${type} ${declared.count} (${declared.ticket})`)
      .join(", ");
    console.log(`Volumes déclarés, pas encore insérés (modèles à venir) : ${pending}.`);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
