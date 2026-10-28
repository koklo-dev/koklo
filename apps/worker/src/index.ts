/** Surface publique du worker pour les tests d'intégration de l'api (jamais pour du code de production). */
export { CaptureMailSender } from "./mail/capture-mail-sender.ts";
export { startWorker, type Worker } from "./worker.ts";
