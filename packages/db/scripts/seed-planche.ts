import { SEED_VOLUME_IDS, seedPlanche } from "../src/seed-volume.ts";
import { PENDING_VOLUMES } from "../src/seed-volumes.ts";
import { loadDatabaseUrl } from "./load-database-url.ts";

seedPlanche(loadDatabaseUrl())
  .then((volume) => {
    console.log(
      `Jeu de la planche appliqué au projet « ${SEED_VOLUME_IDS.planche.name} » : ${volume.features} fonctionnalités, ${volume.tables} tables, ${volume.endpoints} points d'accès, ${volume.tickets} tickets.`,
    );
    const pending = Object.entries(PENDING_VOLUMES.planche)
      .map(([type, declared]) => `${type} ${declared.count} (${declared.ticket})`)
      .join(", ");
    console.log(`Volumes déclarés, pas encore insérés (modèles à venir) : ${pending}.`);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
