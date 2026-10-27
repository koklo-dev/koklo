import { loadConfig } from "./config.ts";
import { startWorker } from "./worker.ts";

const worker = await startWorker(loadConfig(process.env));
console.info("worker started");

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void worker.stop().then(() => process.exit(0));
  });
}
