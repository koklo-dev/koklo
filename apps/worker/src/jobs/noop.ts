/** Nom de la file du job `noop` : sert de preuve de vie du consommateur. */
export const NOOP_QUEUE = "noop";

/** Ne fait rien ; le job est marqué terminé dès que le handler rend la main. */
export async function handleNoop(): Promise<void> {}
